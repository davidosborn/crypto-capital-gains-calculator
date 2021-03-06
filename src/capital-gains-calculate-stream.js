'use strict'

import stream from 'stream'
import formatTime from './format-time'

/**
 * A disposition.
 * @typedef {object} Disposition
 * @property {string} [exchange] The exchange on which the disposition was executed.
 * @property {number} amount     The amount.
 * @property {number} acb        The adjusted cost base.
 * @property {number} pod        The proceeds of disposition.
 * @property {number} oae        The outlays and expenses.
 * @property {number} gain       The capital gain (or loss).
 */
/**
 * The ledger for an asset.
 * @typedef {object} Ledger
 * @property {number}              acb          The adjusted cost base.
 * @property {number}              balance      The balance.
 * @property {array.<Disposition>} dispositions The dispositions.
 */
/**
 * The captial gains.
 * @typedef {object} CapitalGains
 * @property {Map.<string, Forward>}         [forwardByAsset]       The assets that were carried forward from last year.
 * @property {array.<Trade>}                 trades                 The trades.
 * @property {Map.<string, Ledger>}          ledgerByAsset          The ledger of each asset.
 * @property {Map.<string, NegativeBalance>} negativeBalanceByAsset The assets that had a negative balance.
 * @property {Disposition}                   aggregateDisposition   The aggregate disposition.
 * @property {number}                        taxableGain            The taxable gain (or loss).
 */
/**
 * The initial balance and ACB of an asset that was carried forward from last year.
 * @typedef {object} Forward
 * @property {number} balance The balance.
 * @property {number} acb     The adjusted cost base.
 */
/**
 * The information about the negative balance of an asset.
 * @typedef {object} NegativeBalance
 * @property {NegativeBalanceEvent} first   The first negative balance.
 * @property {NegativeBalanceEvent} minimum The minimum negative balance.
 */
/**
 * The information about an occurrence of a negative balance.
 * @typedef {object} NegativeBalanceEvent
 * @property {number} balance The balance at the event.
 * @property {number} time    The time of the event, as a UNIX timestamp.
 */

/**
 * A stream that calculates the capital gains.
 */
class CapitalGainsCalculateStream extends stream.Transform {
	/**
	 * Initializes a new instance.
	 * @param {object}                [options]                The options.
	 * @param {Set.<string>}          [options.assets]         The assets to consider.
	 * @param {Map.<string, Forward>} [options.forwardByAsset] The assets to carry forward from last year.
	 */
	constructor(options) {
		super({
			objectMode: true
		})

		this._options = options

		/**
		 * The assets to carry forward from last year.
		 * @type {Map.<string, Forward>}
		 */
		this._forwardByAsset = this._options?.forwardByAsset

		/**
		 * The trades.
		 * @type {Trade}
		 */
		this._trades = []

		/**
		 * The ledger of each asset.
		 * @type {Map.<string, Ledger>}
		 */
		this._ledgerByAsset = new Map

		/**
		 * The assets that had a negative balance.
		 * @type {Map.<string, number>}
		 */
		this._negativeBalanceByAsset = new Map

		// Initialize the ledger of the assets to carry forward from last year.
		if (this._forwardByAsset)
			for (let [asset, forward] of this._forwardByAsset.entries())
				this._ledgerByAsset.set(asset, {
					acb: forward.acb,
					balance: forward.balance,
					dispositions: []
				})
	}

	/**
	 * Accumulates the capital gains for a transaction.
	 * @param {Transaction} chunk    The transaction.
	 * @param {string}      encoding The encoding type (always 'Buffer').
	 * @param {function}    callback A callback for when the transformation is complete.
	 */
	_transform(chunk, encoding, callback) {
		this._trades.push(chunk)

		let ledger = this._ledgerByAsset.get(chunk.asset)
		if (ledger === undefined)
			this._ledgerByAsset.set(chunk.asset, ledger = {
				acb: 0,
				balance: 0,
				dispositions: []
			})

		if (chunk.amount < 0) {
			if (!ledger.balance)
				console.log('WARNING: Disposition of ' + chunk.asset + ' from an empty balance on ' + formatTime(chunk.time) + '.')

			let acbPerUnit = ledger.balance ? ledger.acb / ledger.balance : 0

			let disposition = {
				exchange: chunk.exchange,
				amount:  -chunk.amount,
				pod:      chunk.value,
				oae:      chunk.feeValue,
				time:     chunk.time
			}
			disposition.acb = disposition.amount * acbPerUnit
			disposition.gain = disposition.pod - disposition.acb - disposition.oae
			ledger.dispositions.push(disposition)

			ledger.acb += acbPerUnit * chunk.amount
		}
		else
			ledger.acb += chunk.value + chunk.feeValue

		// Update the balance.
		ledger.balance += chunk.amount

		// Remove the transaction fee from the balance, except for fiat currencies.
		if (chunk.feeAmount) {
			let feeLedger = this._ledgerByAsset.get(chunk.feeAsset)
			if (feeLedger !== undefined) {
				let feeAcbPerUnit = feeLedger.balance ? feeLedger.acb / feeLedger.balance : 0
				feeLedger.acb -= feeAcbPerUnit * chunk.feeAmount
				feeLedger.balance -= chunk.feeAmount
			}
		}

		// Record the balance and ACB in the trade for information purposes.
		chunk.balance = ledger.balance
		chunk.acb = ledger.acb

		// Check whether the balance is negative, which would indicate an accounting error.
		if (ledger.balance < -0.000000005) {
			let negativeBalance = this._negativeBalanceByAsset.get(chunk.asset)
			if (negativeBalance === undefined) {
				negativeBalance = {
					first: {
						balance: ledger.balance,
						time: chunk.time
					},
					minimum: {
						balance: ledger.balance,
						time: chunk.time
					}
				}
				this._negativeBalanceByAsset.set(chunk.asset, negativeBalance)
			}
			else if (ledger.balance < negativeBalance.minimum.balance)
				negativeBalance.minimum = {
					balance: ledger.balance,
					time: chunk.time
				}
		}

		// Clear the ACB when the balance is negative.
		if (ledger.balance <= 0)
			ledger.acb = 0

		callback()
	}

	_final(callback) {
		// Calculate the aggregate disposition of each asset.
		for (let ledger of this._ledgerByAsset.values())
			ledger.aggregateDisposition = ledger.dispositions.reduce(
				function(a, b) {
					return {
						amount: a.amount + b.amount,
						acb:    a.acb    + b.acb,
						pod:    a.pod    + b.pod,
						oae:    a.oae    + b.oae,
						gain:   a.gain   + b.gain
					}
				}, {
					amount: 0,
					acb:    0,
					pod:    0,
					oae:    0,
					gain:   0
				})

		// Calculate the aggregate disposition of all assets.
		let aggregateDisposition = Array.from(this._ledgerByAsset.values(),
			function(ledger) {
				return ledger.aggregateDisposition
			})
			.reduce(
				function(a, b) {
					return {
						amount: a.amount + b.amount,
						acb:    a.acb    + b.acb,
						pod:    a.pod    + b.pod,
						oae:    a.oae    + b.oae,
						gain:   a.gain   + b.gain
					}
				}, {
					amount: 0,
					acb:    0,
					pod:    0,
					oae:    0,
					gain:   0
				})

		this.push({
			forwardByAsset: this._forwardByAsset,
			trades: this._trades,
			ledgerByAsset: this._ledgerByAsset,
			negativeBalanceByAsset: this._negativeBalanceByAsset,
			aggregateDisposition,
			taxableGain: aggregateDisposition.gain / 2 // Capital gains are taxable at 50%.
		})

		callback()
	}
}

export default function(...args) {
	return new CapitalGainsCalculateStream(...args)
}
