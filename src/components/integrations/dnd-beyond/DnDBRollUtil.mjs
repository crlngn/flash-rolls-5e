import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

const Die = foundry.dice.terms.Die;

/**
 * Utility functions for manipulating Foundry Roll objects
 * Used to replace dice values with DnDB results
 */
export class DnDBRollUtil {

  /**
   * Replace all terms in a roll with terms from the replacer roll
   * @param {Roll} roll - The Foundry roll to modify
   * @param {Roll} replacer - Roll containing the replacement terms
   * @returns {Roll} The modified roll
   */
  static replaceTerms(roll, replacer) {
    if (!roll || !replacer) return roll;
    roll.terms = replacer.terms;
    roll._total = roll._evaluateTotal();
    roll.resetFormula();
    return roll;
  }

  /**
   * Replace only dice terms, keeping Foundry's modifiers
   * Useful when you want DnDB dice values but Foundry calculated modifiers
   * @param {Roll} roll - The Foundry roll to modify
   * @param {Roll} replacer - Roll containing the replacement dice
   * @returns {Roll} The modified roll
   */
  static replaceDie(roll, replacer) {
    if (!replacer || !roll) return roll;
    if (!replacer.terms) {
      LogUtil.error("DnDBRollUtil.replaceDie - replacer.terms is undefined", [replacer]);
      return roll;
    }

    const replacerDice = replacer.terms.filter(t => t instanceof Die || t.class === "Die") || [];
    const noDice = roll?.terms?.filter(t => !(t instanceof Die || t.class === "Die")) || [];
    roll.terms = [...replacerDice, ...noDice];

    roll._total = roll._evaluateTotal();
    roll.resetFormula();
    return roll;
  }

  /**
   * Create a Foundry Roll object from DnDB roll data
   * Creates proper Die terms with pre-evaluated results so formula displays correctly
   * @param {Object} ddbRoll - The DnDB roll data
   * @returns {Roll} A Foundry Roll object
   */
  static createRollFromDnDB(ddbRoll) {
    const notation = ddbRoll.diceNotation;
    if (!notation) return null;

    const terms = [];
    for (const set of notation.set || []) {
      const faces = parseInt(set.dieType.replace("d", ""), 10);
      const results = set.dice.map((d, i) => ({
        result: d.dieValue,
        active: true,
        indexThrow: i
      }));

      const die = new Die({ faces, number: set.count });
      die._evaluated = true;
      die.results = results;
      terms.push(die);
    }

    if (notation.constant) {
      const OperatorTerm = foundry.dice.terms.OperatorTerm;
      const NumericTerm = foundry.dice.terms.NumericTerm;
      const operator = notation.constant >= 0 ? "+" : "-";
      const operatorTerm = new OperatorTerm({ operator });
      operatorTerm._evaluated = true;
      terms.push(operatorTerm);
      const numericTerm = new NumericTerm({ number: Math.abs(notation.constant) });
      numericTerm._evaluated = true;
      terms.push(numericTerm);
    }

    const roll = Roll.fromTerms(terms);
    roll._evaluated = true;
    roll._total = ddbRoll.result?.total || 0;

    return roll;
  }

  /**
   * Build Die terms from DnDB dice data
   * @param {Object} ddbRoll - The DnDB roll data
   * @returns {Array<Die>} Array of Die terms
   */
  static buildDieTermsFromDnDB(ddbRoll) {
    const notation = ddbRoll.diceNotation;
    if (!notation) return [];

    const terms = [];
    for (const set of notation.set || []) {
      const faces = parseInt(set.dieType.replace("d", ""), 10);
      const results = set.dice.map((d, i) => ({
        result: d.dieValue,
        active: true,
        indexThrow: i
      }));

      const die = new Die({ faces, number: set.count });
      die._evaluated = true;
      die.results = results;
      terms.push(die);
    }

    return terms;
  }

  /**
   * Inject DnDB dice values into an existing Foundry roll
   * Preserves Foundry's modifiers while replacing dice values
   * @param {Roll} foundryRoll - The Foundry roll
   * @param {Object} ddbRoll - The DnDB roll data
   * @returns {Roll} The modified roll
   */
  static injectDnDBDiceValues(foundryRoll, ddbRoll) {
    if (!foundryRoll || !ddbRoll) return foundryRoll;

    const notation = ddbRoll.diceNotation;
    if (!notation) return foundryRoll;

    let ddbDiceIndex = 0;
    const allDnDBDice = [];
    for (const set of notation.set || []) {
      for (const die of set.dice || []) {
        allDnDBDice.push(die.dieValue);
      }
    }

    for (const term of foundryRoll.terms) {
      if (term instanceof Die || term.class === "Die") {
        for (const result of term.results || []) {
          if (ddbDiceIndex < allDnDBDice.length) {
            result.result = allDnDBDice[ddbDiceIndex];
            ddbDiceIndex++;
          }
        }
      }
    }

    foundryRoll._total = foundryRoll._evaluateTotal();
    foundryRoll.resetFormula();
    return foundryRoll;
  }
}
