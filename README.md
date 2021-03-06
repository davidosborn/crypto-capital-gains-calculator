# Crypto Tax Calculator

A tool to calculate the capital gains of cryptocurrency assets for Canadian taxes.
The source data comes from a set of trade logs, which are provided by the exchanges.
The *adjusted cost base* (ACB) is used to calculate the capital gains.

## Introduction

I created this software to calculate the capital gains from my 2017 cryptocurrency trades for tax purposes.
For my 2018 taxes, I refined the software with many new options to handle missing logs, stolen assets, and other complex issues.

Please note that I am not an accountant, and I do not warrant the validity of the results.

## Exchanges

The following exchanges are supported out-of-the-box:

- Binance
- Bittrex
- Kraken
- KuCoin

It is easy to add support for additional exchanges.
Simply add a parser in `trade-parse-stream.js` to convert a CSV row to the normalized format.
You can look at the existing parsers as examples of how to do this.

## Usage

Run the program with `npm start` or `node index`.
Add the `--help` option to see the available options.

Typical usage involves running the program with a set of trade logs in the form of CSV files.
For example:

```bash
node index data/*-2018.csv -odata/results-2018.md --init=\
BTC:0.73396222:12721.04,\
ETH:4.18451232:3478.97,\
LTC:11.09684:3113.88
```

The resulting Markdown or HTML contains:

- The assets carried forward from the previous year (if any).
- A list of trades, ordered by time, including fees and the running ACB.
- A list of dispositions, ordered by asset and time, including the POD, ACB, OAE, and the running gain (or loss).
- A summary of the aggregate dispositions per asset.
- A summary of the aggregate gain (or loss), ACB, and remaining balance per asset.
- The total taxable capital gains.
- The assets that can be carried forward to the next year (if any).

### Options

There are options for filtering by currency, defining the initial balance, limiting the number of trades, and providing historical data.

| Short option | Long option   | Argument                                           | Description
| ------------ | ------------- | -------------------------------------------------- | -----------
| `-a`         | `--assets`    | &lt;spec&gt; [<sup>[1]</sup>](#options-footnote-1) | Only consider trades involving the specified assets.
| `-h`         | `--help`      |                                                    | Display this usage information and exit.
| `-i`         | `--init`      | &lt;spec&gt; [<sup>[2]</sup>](#options-footnote-2) | Define the initial balance and ACB of the assets.
| `-m`         | `--html`      |                                                    | Format the results as HTML instead of Markdown.
| `-o`         | `--output`    | &lt;file&gt;                                       | Write the results to the specified file.
| `-q`         | `--quiet`     |                                                    | Do not write the results.
| `-s`         | `--show`      | &lt;spec&gt; [<sup>[1]</sup>](#options-footnote-1) | Only show the specified assets.
| `-t`         | `--take`      | &lt;count&gt;                                      | Do not process more than the specified number of trades.
| `-v`         | `--verbose`   |                                                    | Write extra information to the console.
| `-w`         | `--web`       |                                                    | Request historical asset values from the internet.
| `-y`         | `--history`   | &lt;path&gt; [<sup>[3]</sup>](#options-footnote-1) | Read historical asset values from the specified directory.

<sup id="options-footnote-1">[1]</sup>
A subset of the available assets can be considered for the calculation by the `--assets` option, or used to filter the results by the `--show` option.
The argument in both cases is a comma-separated list of assets.

<sup id="options-footnote-2">[2]</sup>
The balances can be carried forward from last year by the `--init` option.
The argument is a comma-separated list of assets, each with its balance and adjusted cost base, in the form of `<asset>:<balance>[:<acb>],...`, such as `--init=BTC:1:5000,ETH:5:1000,LTC:10:80`.

#### Historical data

<sup id="options-footnote-3">[3]</sup>
Historical data may be provided to the program using the `--history` option.

##### Format

The data for each currency pair must be stored in a JSON file named `<base>-<quote>.json`.
Each JSON file must contain an array of historical samples, ordered by time.
Each historical sample must contain the following fields:

| Field    | Type   | Semantics      | Description                                     |
| -------- | ------ | -------------- | ----------------------------------------------- |
| `time`   | Number | UNIX timestamp | The opening time of the trading period.         |
| `open`   | Number | Currency       | The price at the opening of the trading period. |
| `close`  | Number | Currency       | The price at the closing of the trading period. |

Compatible files can be generated by the [@davidosborn/crypto-history-parser](https://www.npmjs.com/package/@davidosborn/crypto-history-parser) npm package.
