import Web3 from "web3";
import BigNumber from "bignumber.js";
import 'dotenv/config'
import fetch from "cross-fetch";

import abis from "../abis";
import addresses from "../addresses";
// import Swapcontract from "../build/contracts/Flashswap.json";


const web3 = new Web3(
    new Web3.providers.WebsocketProvider(process.env.INFURA_WSS as string)
);

const uniswapFactory = new web3.eth.Contract(
    abis.uniswapFactory.uniswapFactory,
    addresses.uniswapRopsten.factory
);
const uniswapRouter = new web3.eth.Contract(
    abis.uniswapRouter.uniswapRouter,
    addresses.uniswapRopsten.router
);

const sushiswapFactory = new web3.eth.Contract(
    abis.uniswapFactory.uniswapFactory,
    addresses.sushiswapRopsten.factory
);
const sushiswapRouter = new web3.eth.Contract(
    abis.uniswapRouter.uniswapRouter,
    addresses.sushiswapRopsten.router
);

// const swapContract = new web3.eth.Contract(
//     Swapcontract.abi,
//     addresses.flashswapRopsten.address
// );

const { address: admin } = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

const WETH = '0xc778417e063141139fce010982780140aa0cd5ab';
const fromTokens = ['WETH'];
const fromToken = [
    '0xc778417e063141139fce010982780140aa0cd5ab' // WETH
];
const fromTokenDecimals = [18];

const toTokens = ['DAI', 'UNI'];
const toToken = [
    '0xaD6D458402F60fD3Bd25163575031ACDce07538D', // DAI
    '0x71d82Eb6A5051CfF99582F4CDf2aE9cD402A4882', // UNI
];
const toTokenDecimals = [18, 18];
const amount = "0.01"

async function main() {
    const networkId = await web3.eth.net.getId();
    console.log(`network ID is ${networkId}`);
    let subscription = web3.eth.subscribe('newBlockHeaders', (error, result) => {
        if (!error) {
            // console.log(result);
            return;
        }
        console.error(error);
    })
        .on("connected", subscriptionId => {
            console.log(`You are connected on ${subscriptionId}`);
        })
        .on('data', async block => {
            console.log('-------------------------------------------------------------');
            console.log(`New block received. Block # ${block.number}`);
            console.log(`GasLimit: ${block.gasLimit} and Timestamp: ${block.timestamp}`);
            const object = await fetch("https://cex.io/api/last_price/ETH/USD");
            const ethUsd = parseFloat((await object.json()).lprice);

            for (let i = 0; i < fromTokens.length; i++) {
                for (let j = 0; j < toTokens.length; j++) {
                    console.log(`Trading ${toTokens[j]}/${fromTokens[i]} ...`);

                    const pairAddress = await uniswapFactory.methods.getPair(fromToken[i], toToken[j]).call();
                    console.log(`pairAddress ${toTokens[j]}/${fromTokens[i]} is ${pairAddress}`);
                    const unit0 = await new BigNumber(amount);
                    const amount0 = await new BigNumber(unit0).shiftedBy(fromTokenDecimals[i]);
                    console.log(`Input amount of ${fromTokens[i]}: ${unit0.toString()}`);

                    // The quote currency needs to be WBNB
                    let tokenIn, tokenOut;
                    if (fromToken[i] === WETH) {
                        tokenIn = fromToken[i];
                        tokenOut = toToken[j];
                    } else if (toToken[j] === WETH) {
                        tokenIn = toToken[j];
                        tokenOut = fromToken[i];
                    } else {
                        return;
                    }

                    // The quote currency is not WETH
                    if (typeof tokenIn === 'undefined') {
                        return;
                    }

                    // call getAmountsOut in UniSwap
                    const amounts = await uniswapRouter.methods.getAmountsOut(amount0, [tokenIn, tokenOut]).call();
                    const unit1 = await new BigNumber(amounts[1]).shiftedBy(-toTokenDecimals[j]);
                    const amount1 = await new BigNumber(amounts[1]);
                    console.log(`
                        Buying token at UniSwap DEX
                        =================
                        tokenIn: ${unit0.toString()} ${fromTokens[i]}
                        tokenOut: ${unit1.toString()} ${toTokens[j]}
                    `);

                    // call getAmountsOut in SushiSwap
                    const amounts2 = await sushiswapRouter.methods.getAmountsOut(amount1, [tokenOut, tokenIn]).call();
                    const unit2 = await new BigNumber(amounts2[1]).shiftedBy(-fromTokenDecimals[i]);
                    const amount2 = await new BigNumber(amounts2[1]);
                    console.log(`
                        Buying back token at SushiSwap DEX
                        =================
                        tokenOut: ${unit1.toString()} ${toTokens[j]}
                        tokenIn: ${unit2.toString()} ${fromTokens[i]}
                    `);

                    let profit = await new BigNumber(amount2).minus(amount0);
                    let unit3 = await new BigNumber(unit2).minus(unit0);
                    // if (profit > 0) {
                    //     console.log(`Price is higher than expected. (expected: ${toTokenThreshold[j]})`);
                    //     let nonce = await web3.eth.getTransactionCount(admin);
                    //     let gasPrice = await web3.eth.getGasPrice();
                    //     const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
                    //     const tx = uniswapRouter.methods.swapExactETHForTokens(
                    //         amount1,
                    //         [WETH, toToken[j]],
                    //         process.env.WALLET_ADDRESS as string,
                    //         deadline
                    //     )
                    //     const data = tx.encodeABI();
                    //     const txData = {
                    //         gasLimit: 244155,
                    //         gas: gasPrice,
                    //         from: admin,
                    //         to: addresses.uniswapMainnet.router,
                    //         data,
                    //         nonce: nonce,
                    //         value: await web3.utils.toWei(amount, 'ether')
                    //     }
                    //     try {
                    //         console.log(`[${block.number}] [${new Date().toLocaleString()}] : sending transactions...`, JSON.stringify(txData))
                    //         flag = true;
                    //         const receipt = await web3.eth.sendTransaction(txData);
                    //         flag = false;
                    //         console.log(receipt);
                    //     } catch (e) {
                    //         flag = false;
                    //         console.error('transaction error', e);
                    //     }
                    // }
                    // else {
                    //     console.log(`Price is lower than expected. (expected: ${toTokenThreshold[j]})`);
                    // }
                }
            }
        })
        .on('error', error => {
            console.log(error);
        });
}

main();