const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
const chainId = network.config.chainId

!developmentChains.includes(network.name) ? describe.skip : describe("Lottery Unit Tests", async function () {
    let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture("all")
        lottery = await ethers.getSigners("Lottery", deployer)
        vrfCoordinatorV2Mock = await ethers.getSigners("VRFCoordinatorV2Mock", deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
    })

    describe("constructor", async function () {
        it("initializes the lottery correctly", async function () {
            const lotteryState = (await lottery.getLotteryState()).toString()
            const interval = await lottery.getInterval()

            assert.equal(lotteryState, "0");
            assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        })
    })

    describe("enterLottery", async function () {
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
    describe("checkUpkeep", async function () {
        it("returns false if people haven't sent any ETH", async function () {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.send("evm_mine", [])
            const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
            assert(!upkeepNeeded)
        })
    })
})