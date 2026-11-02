import { builder } from './builder.ts';

export interface FieldIssue {
  path: string;
  code: string;
  message: string;
  step: string | null;
}

export class ValidationFailed extends Error {
  readonly fieldErrors: FieldIssue[];
  constructor(fieldErrors: FieldIssue[]) {
    super(fieldErrors.length === 1 ? fieldErrors[0]!.message : `${fieldErrors.length} fields need attention`);
    this.fieldErrors = fieldErrors;
  }
}

export class PermissionDenied extends Error {
  readonly requiredRole: 'ADMIN' | 'MANAGER';
  constructor(requiredRole: 'ADMIN' | 'MANAGER') {
    super(requiredRole === 'ADMIN' ? 'Only a portfolio admin can do this.' : 'Your role can view this but not change it.');
    this.requiredRole = requiredRole;
  }
}

export class StaleVersion extends Error {
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super('Someone else changed this since you opened it. Reload to see their changes, then try again.');
    this.currentVersion = currentVersion;
  }
}

export class NotFound extends Error {
  constructor(what: string) {
    super(`${what} was not found.`);
  }
}

export class QuotaExceeded extends Error {
  readonly limit: string;
  constructor(limit: string, message: string) {
    super(message);
    this.limit = limit;
  }
}

const ErrorInterface = builder.interfaceRef<Error>('DomainError').implement({
  description: 'An expected failure the client can show to the person who caused it.',
  fields: (t) => ({ message: t.exposeString('message') }),
});

const FieldError = builder.objectRef<FieldIssue>('FieldError').implement({
  fields: (t) => ({
    path: t.exposeString('path', { description: 'Dotted path of the input field, e.g. "rent.amount".' }),
    code: t.exposeString('code'),
    message: t.exposeString('message'),
    step: t.exposeString('step', { nullable: true, description: 'The form step the field belongs to.' }),
  }),
});

builder.objectType(ValidationFailed, {
  name: 'ValidationFailed',
  interfaces: [ErrorInterface],
  fields: (t) => ({ fieldErrors: t.field({ type: [FieldError], resolve: (e) => e.fieldErrors }) }),
});

builder.objectType(PermissionDenied, {
  name: 'PermissionDenied',
  interfaces: [ErrorInterface],
  fields: (t) => ({ requiredRole: t.exposeString('requiredRole') }),
});

builder.objectType(StaleVersion, {
  name: 'StaleVersion',
  interfaces: [ErrorInterface],
  fields: (t) => ({ currentVersion: t.exposeInt('currentVersion') }),
});

builder.objectType(NotFound, { name: 'NotFound', interfaces: [ErrorInterface], fields: () => ({}) });

builder.objectType(QuotaExceeded, {
  name: 'QuotaExceeded',
  interfaces: [ErrorInterface],
  fields: (t) => ({ limit: t.exposeString('limit') }),
});

export const WRITE_ERRORS = [ValidationFailed, PermissionDenied, StaleVersion, NotFound, QuotaExceeded];
