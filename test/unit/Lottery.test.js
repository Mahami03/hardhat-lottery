const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const chainId = network.config.chainId

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery Unit Tests", function () {
    let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture("all")
        lottery = await ethers.getContract("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
    })

    describe("constructor", function () {
        it("initializes the lottery correctly", async function () {
            const lotteryState = (await lottery.getLotteryState()).toString()
            const interval = await lottery.getInterval()

            assert.equal(lotteryState, "0");
            assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        })
    })

    describe("enterLottery", function () {
        it("reverts when you don't pay enough...", async function () {
            await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughETHEntered")
        })
        it("records players when they enter", async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            const playerFromContract = await lottery.getPlayer(0)
            assert.equal(playerFromContract, deployer)
        })
        it("emmits event on enter", async function () {
            await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.emit(lottery, "LotteryEnter")
        })
        it("doesn't allow entrance when lottery is calculating", async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            await lottery.performUpkeep([])
            await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith("Lottery__NotOpen")
        })
    })
    describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async function () {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
        it("returns false if raffle isn't open", async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            await lottery.performUpkeep([])
            const lotteryState = await lottery.getLotteryState()
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert.equal(lotteryState.toString(), "1")
            assert.equal(upkeepNeeded, false)
        })
    })
    describe("performUpkeep", function () {
        it("it can only run if checkUpkeep is true", async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const tx = await lottery.performUpkeep([])
            assert(tx)
        })
        it("reverts when checkUpkeep is false", async function () {
            await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
        })
        it("updates the lottery state,emits and event,and calls the vrf coordinator", async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const txResponse = await lottery.performUpkeep([])
            const txReciept = await txResponse.wait(1)
            const requestId = txReciept.events[1].args.requestId
            const lotteryState = await lottery.getLotteryState()
            assert(requestId.toNumber() > 0)
            assert(lotteryState.toString() == "1")
        })
    })
    describe("fulfillRandomWords", function () {
        beforeEach(async function () {
            await lottery.enterLottery({ value: lotteryEntranceFee })
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
        })
        it("can only be called after performUpkeep", async function () {
            await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
        })
        it("picks a winner, resets the lottery,and sends money", async function () {
            const additionalEntrants = 3
            const startingAccIndex = 1
            const accounts = await ethers.getSigners()
            for (let i = startingAccIndex; i < startingAccIndex + additionalEntrants; i++) {
                const accountConnecteddLottery = lottery.connect(accounts[i])
                await accountConnecteddLottery.enterLottery({ value: lotteryEntranceFee })
            }
            const startingTimeStamp = await lottery.getLastTimeStamp()
            await new Promise(async (resolve, reject) => {
                lottery.once("WinnerPicked", async () => {
                    console.log("Found the event!")
                    try {
                        const recentWinner = await lottery.getRecenWinner()
                        console.log(recentWinner)

                        const lotteryState = await lottery.getLotteryState()
                        const endingTimeStamp = await lottery.getLastTimeStamp()
                        const numPlayers = await lottery.getNumOfPlayers()
                        const winnerEndingBalance = await accounts[1].getBalance()
                        assert.equal(numPlayers.toString(), "0")
                        assert.equal(lotteryState.toString(), "0")
                        assert(endingTimeStamp > startingTimeStamp)
                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(lotteryEntranceFee
                            .mul(additionalEntrants)
                            .add(lotteryEntranceFee)
                            .toString()
                        ))
                    } catch (e) {
                        reject(e)
                    }
                    resolve()
                })
                const tx = await lottery.performUpkeep([])
                const txReciept = await tx.wait(1)
                const winnerStartingBalance = await accounts[1].getBalance()
                await vrfCoordinatorV2Mock.fulfillRandomWords(txReciept.events[1].args.requestId, lottery.address)
            })
        })
    })
})