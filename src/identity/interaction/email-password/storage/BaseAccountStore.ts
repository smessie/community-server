import assert from 'assert';
import { hash, compare } from 'bcrypt';
import { v4 } from 'uuid';
import type { KeyValueStorage } from '../../../../storage/keyvalue/KeyValueStorage';
import type { AccountStore } from './AccountStore';

/**
 * A payload to persist a user account
 */
export interface AccountPayload {
  webId: string;
  email: string;
  password: string;
}

/**
 * A payload to persist the fact that a user
 * has requested to reset their password
 */
export interface ForgotPasswordPayload {
  email: string;
  recordId: string;
}

export type EmailPasswordData = AccountPayload | ForgotPasswordPayload;

export interface BaseAccountStoreArgs {
  storageName: string;
  storage: KeyValueStorage<string, EmailPasswordData>;
  saltRounds: number;
}

/**
 * A EmailPasswordStore that uses a KeyValueStorage
 * to persist its information.
 */
export class BaseAccountStore implements AccountStore {
  private readonly storageName: string;
  private readonly storage: KeyValueStorage<string, EmailPasswordData>;
  private readonly saltRounds: number;

  public constructor(args: BaseAccountStoreArgs) {
    this.storageName = args.storageName;
    this.storage = args.storage;
    this.saltRounds = args.saltRounds;
  }

  /**
   * Generates a ResourceIdentifier to store data for the given email.
   */
  private getAccountResourceIdentifier(email: string): string {
    return `${this.storageName}/account/${encodeURIComponent(email)}`;
  }

  /**
   * Generates a ResourceIdentifier to store data for the given recordId.
   */
  private getForgotPasswordRecordResourceIdentifier(recordId: string): string {
    return `${this.storageName}/forgot-password-resource-identifier/${encodeURIComponent(recordId)}`;
  }

  /**
   * Helper function that converts the given e-mail to an account identifier
   * and retrieves the account data from the internal storage.
   */
  private async getAccountPayload(email: string): Promise<{ key: string; account?: AccountPayload }> {
    const key = this.getAccountResourceIdentifier(email);
    const account = await this.storage.get(key) as AccountPayload | undefined;
    return { key, account };
  }

  public async authenticate(email: string, password: string): Promise<string> {
    const { account } = await this.getAccountPayload(email);
    assert(account, 'No account by that email');
    assert(await compare(password, account.password), 'Incorrect password');
    return account.webId;
  }

  public async create(email: string, webId: string, password: string): Promise<void> {
    const { key, account } = await this.getAccountPayload(email);
    assert(!account, 'Account already exists');
    const payload: AccountPayload = {
      email,
      webId,
      password: await hash(password, this.saltRounds),
    };
    await this.storage.set(key, payload);
  }

  public async changePassword(email: string, password: string): Promise<void> {
    const { key, account } = await this.getAccountPayload(email);
    assert(account, 'Account does not exist');
    account.password = await hash(password, this.saltRounds);
    await this.storage.set(key, account);
  }

  public async deleteAccount(email: string): Promise<void> {
    await this.storage.delete(this.getAccountResourceIdentifier(email));
  }

  public async generateForgotPasswordRecord(email: string): Promise<string> {
    const recordId = v4();
    const { account } = await this.getAccountPayload(email);
    assert(account, 'Account does not exist');
    await this.storage.set(
      this.getForgotPasswordRecordResourceIdentifier(recordId),
      { recordId, email },
    );
    return recordId;
  }

  public async getForgotPasswordRecord(recordId: string): Promise<string | undefined> {
    const identifier = this.getForgotPasswordRecordResourceIdentifier(recordId);
    const forgotPasswordRecord = await this.storage.get(identifier) as ForgotPasswordPayload | undefined;
    return forgotPasswordRecord?.email;
  }

  public async deleteForgotPasswordRecord(recordId: string): Promise<void> {
    await this.storage.delete(this.getForgotPasswordRecordResourceIdentifier(recordId));
  }
}
