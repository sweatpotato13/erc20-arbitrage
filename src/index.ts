import Web3 from "web3";
import BigNumber from "bignumber.js";
import 'dotenv/config'
import fetch from "cross-fetch";

import abis from "../abis";
import addresses from "../addresses";


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

const flashSwap = new web3.eth.Contract(
    abis.flashSwap.Flashswap,
    addresses.flashswapRopsten.address
)

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
const amount = 0.001

const pairs = [
    {
        name: 'WETH to BISCUITxx, uniswap>sushi',
        amountTokenPay: amount,
        tokenPay: "0xc778417e063141139fce010982780140aa0cd5ab",
        tokenSwap: "0xEbfc24130F58e67037c8B3CEfEbC8904aEfF6d2E",
        sourceRouter: addresses.uniswapRopsten.router,
        targetRouter: addresses.sushiswapRopsten.router,
        sourceFactory: addresses.uniswapRopsten.factory,
    },
    {
        name: 'WETH to COMP, uniswap>sushi',
        amountTokenPay: amount,
        tokenPay: "0xc778417e063141139fce010982780140aa0cd5ab",
        tokenSwap: "0xf76D4a441E4ba86A923ce32B89AFF89dBccAA075",
        sourceRouter: addresses.uniswapRopsten.router,
        targetRouter: addresses.sushiswapRopsten.router,
        sourceFactory: addresses.uniswapRopsten.factory,
    }

]
// async function approve() {
//     let gasPrice = await web3.eth.getGasPrice();
//     let nonce = await web3.eth.getTransactionCount(admin);

//     const erc20 = new web3.eth.Contract(
//         abis.erc20,
//         "0xEbfc24130F58e67037c8B3CEfEbC8904aEfF6d2E"
//     );

//     const tx = erc20.methods.approve(
//         "0x353e6E203E5Dd868973521755954B6CD1b9159B2",
//         new BigNumber("115792089237316195423570985008687907853269984665640564039457584007913129639935")
//     );
//     const data = tx.encodeABI();
//     const txData = {
//         from: admin,
//         to: "0xEbfc24130F58e67037c8B3CEfEbC8904aEfF6d2E",
//         data: data,
//         gas: gasPrice,
//         gasLimit: 30000,
//         nonce: nonce
//     };
//     const receipt = await web3.eth.sendTransaction(txData);
//     console.log(receipt);
// }

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

            for (const pair of pairs) {
                const check = await flashSwap.methods.check(pair.tokenPay, new BigNumber(pair.amountTokenPay * 1e18), pair.tokenSwap, pair.sourceRouter, pair.targetRouter).call();

                const profit = check[0];

                let s = pair.tokenPay.toLowerCase();
                const price = ethUsd;
                if (!price) {
                    console.log('invalid price', pair.tokenPay);
                    return;
                }
                const profitUsd = profit / 1e18 * price;
                const percentage = (100 * (profit / 1e18)) / pair.amountTokenPay;
                console.log(`[${block.number}] [${new Date().toLocaleString()}]: [${pair.name}] Arbitrage checked! Expected profit: ${(profit / 1e18).toFixed(3)} $${profitUsd.toFixed(2)} - ${percentage.toFixed(2)}%`);

                if (profit > 0) {
                    let gasPrice = await web3.eth.getGasPrice();
                    console.log(`[${block.number}] [${new Date().toLocaleString()}]: [${pair.name}] Arbitrage opportunity found! Expected profit: ${(profit / 1e18).toFixed(3)} $${profitUsd.toFixed(2)} - ${percentage.toFixed(2)}%`);

                    const tx = flashSwap.methods.start(
                        block.number + 2,
                        pair.tokenPay,
                        new BigNumber(pair.amountTokenPay * 1e18),
                        pair.tokenSwap,
                        pair.sourceRouter,
                        pair.targetRouter,
                        pair.sourceFactory,
                    );

                    // let estimateGas: number
                    // try {
                    //     estimateGas = await tx.estimateGas({ from: admin });
                    // } catch (e: any) {
                    //     console.log(`[${block.number}] [${new Date().toLocaleString()}]: [${pair.name}]`, 'gasCost error', e.message);
                    //     return;
                    // }

                    const myGasPrice = parseFloat(gasPrice) * 150000;
                    const txCostETH = web3.utils.toWei(myGasPrice.toString());

                    // calculate the estimated gas cost in USD
                    let gasCostUsd = (myGasPrice / 1e18) * price;
                    const profitMinusFeeInUsd = profitUsd - gasCostUsd;

                    if (profitMinusFeeInUsd < 0.6) {
                        console.log(`[${block.number}] [${new Date().toLocaleString()}]: [${pair.name}] stopped: `, JSON.stringify({
                            profit: "$" + profitMinusFeeInUsd.toFixed(2),
                            profitWithoutGasCost: "$" + profitUsd.toFixed(2),
                            gasCost: "$" + gasCostUsd.toFixed(2),
                            myGasPrice: myGasPrice.toString(),
                            txCostETH: txCostETH,
                        }));
                    }

                    if (profitMinusFeeInUsd > 0.6) {
                        let nonce = await web3.eth.getTransactionCount(admin);
                        console.log(`[${block.number}] [${new Date().toLocaleString()}]: [${pair.name}] and go: `, JSON.stringify({
                            profit: "$" + profitMinusFeeInUsd.toFixed(2),
                            profitWithoutGasCost: "$" + profitUsd.toFixed(2),
                            gasCost: "$" + gasCostUsd.toFixed(2),
                        }));

                        const data = tx.encodeABI();
                        const txData = {
                            from: admin,
                            to: addresses.flashswapRopsten.address,
                            data: data,
                            gas: gasPrice,
                            gasLimit: 150000,
                            nonce: nonce
                        };

                        console.log(`[${block.number}] [${new Date().toLocaleString()}]: sending transactions...`, JSON.stringify(txData))

                        try {
                            await web3.eth.sendTransaction(txData);
                        } catch (e) {
                            console.error('transaction error', e);
                        }
                    }
                }
            }
        })
        .on('error', error => {
            console.log(error);
        });
}

main();