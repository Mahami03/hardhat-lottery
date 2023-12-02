const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

developmentChains.includes(network.name) ? describe.skip : describe("Lottery Unit Tests", function () {
    let lottery, lotteryEntranceFee, deployer

    beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        lottery = await ethers.getContract("Lottery", deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
    })
    describe("fulfillRandomWords", function () {
        it("works with live Chainlink Keepers and Chainlink VRF , we get a random winner", async function () {
            const startingTimeStamp = await lottery.getLastTimeStamp()
            const accounts = ethers.getSigners()

            await new Promise(async (resolve, reject) => {
                lottery.once("WinnerPicked", async () => {
                    console.log("WinnerPicked event fired!")
                    try {
                        const recentWinner = await lottery.getRecenWinner()
                        const lotteryState = await lottery.getLotteryState()
                        const winnerEndingBalance = await accounts[0].getBalance()
                        const endingTimeStamp = await lottery.getLastTimeStamp()
                        await expect(lottery.getPlayer(0)).to.be.reverted
                        assert.equal(recentWinner.toString(), accounts[0].address)
                        assert.equal(lotteryState, 0)
                        assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(lotteryEntranceFee).toString())
                        assert(endingTimeStamp > startingTimeStamp)
                        resolve()
                    } catch (error) {
                        console.log(error)
                        reject(e)
                    }
                })
                await lottery.enterLottery({ value: lotteryEntranceFee })
                const winnerStartingBalance = await accounts[0].getBalance()
            })
        })
    })
})