export type LedgerErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_CURRENCY'
  | 'INVALID_TERM'
  | 'INVALID_EFFECTIVE_DATE'
  | 'UNSUPPORTED_CHANGE';

/** A domain error the API maps to a typed GraphQL result. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}
