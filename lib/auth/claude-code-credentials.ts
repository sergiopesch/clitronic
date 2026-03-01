/**
 * Utility module for reading Claude Code OAuth credentials from the system.
 *
 * On macOS: Reads from Keychain using 'security' CLI tool
 * On Linux: Reads from ~/.claude/.credentials.json
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Error codes for credential-related errors
 */
export type CredentialsErrorCode =
  | 'NOT_INSTALLED'
  | 'CREDENTIALS_NOT_FOUND'
  | 'TOKEN_EXPIRED'
  | 'KEYCHAIN_ACCESS_DENIED'
  | 'UNSUPPORTED_PLATFORM'
  | 'PARSE_ERROR';

/**
 * Custom error class for Claude Code credential errors
 */
export class ClaudeCodeCredentialsError extends Error {
  public readonly code: CredentialsErrorCode;
  public readonly expiresAt?: number;

  constructor(
    message: string,
    code: CredentialsErrorCode,
    expiresAt?: number
  ) {
    super(message);
    this.name = 'ClaudeCodeCredentialsError';
    this.code = code;
    this.expiresAt = expiresAt;
  }
}

/**
 * OAuth credential structure stored by Claude Code
 */
export interface ClaudeAiOauth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  scopes: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

/**
 * Full credentials structure as stored by Claude Code
 */
export interface ClaudeCodeCredentials {
  claudeAiOauth?: ClaudeAiOauth;
}

/**
 * Result of reading credentials
 */
export interface CredentialResult {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

/**
 * Result of checking credentials availability
 */
export interface CredentialsAvailableResult {
  available: true;
  expiresAt: number;
}

export interface CredentialsUnavailableResult {
  available: false;
  reason: string;
}

export type CheckCredentialsResult =
  | CredentialsAvailableResult
  | CredentialsUnavailableResult;

// Constants for credential storage
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const KEYCHAIN_ACCOUNT = 'default';
const LINUX_CREDENTIALS_PATH = '.claude/.credentials.json';

/**
 * Check if the current platform is macOS
 */
function isMacOS(): boolean {
  return os.platform() === 'darwin';
}

/**
 * Check if the current platform is Linux
 */
function isLinux(): boolean {
  return os.platform() === 'linux';
}

/**
 * Check if credentials are expired
 * @param expiresAt - Unix timestamp in milliseconds
 * @returns true if expired, false otherwise
 */
function isExpired(expiresAt: number): boolean {
  // Add 60 second buffer to avoid edge cases
  return Date.now() >= expiresAt - 60000;
}

/**
 * Read credentials from macOS Keychain using the security CLI tool
 */
async function readFromKeychain(): Promise<ClaudeCodeCredentials | null> {
  try {
    // Use macOS security command to read from Keychain
    // Try different account names that Claude Code might use
    const accounts = ['credentials', 'default', ''];

    for (const account of accounts) {
      try {
        const accountArg = account ? `-a "${account}"` : '';
        const { stdout } = await execAsync(
          `security find-generic-password -s "${KEYCHAIN_SERVICE}" ${accountArg} -w 2>/dev/null`
        );

        const credentialsJson = stdout.trim();
        if (credentialsJson) {
          return JSON.parse(credentialsJson) as ClaudeCodeCredentials;
        }
      } catch {
        // Try next account name
        continue;
      }
    }

    // If Keychain fails, try reading from file as fallback
    // Claude Code sometimes stores credentials in file on macOS too
    return await readFromFilesystem();
  } catch (error) {
    // Check for Keychain access denied errors
    if (
      error instanceof Error &&
      (error.message.includes('access denied') ||
        error.message.includes('not allowed') ||
        error.message.includes('User interaction is not allowed'))
    ) {
      throw new ClaudeCodeCredentialsError(
        'Keychain access denied. Please grant permission to access Claude Code credentials.',
        'KEYCHAIN_ACCESS_DENIED'
      );
    }
    // If all attempts fail, return null
    return null;
  }
}

/**
 * Read credentials from Linux filesystem
 */
async function readFromFilesystem(): Promise<ClaudeCodeCredentials | null> {
  try {
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, LINUX_CREDENTIALS_PATH);

    const fileContent = await fs.readFile(credentialsPath, 'utf-8');
    return JSON.parse(fileContent) as ClaudeCodeCredentials;
  } catch (error) {
    // File doesn't exist or can't be read
    if (error instanceof Error && 'code' in error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        // File not found - this is expected if Claude Code hasn't been used
        return null;
      }
    }
    // JSON parse errors
    if (error instanceof SyntaxError) {
      throw new ClaudeCodeCredentialsError(
        'Failed to parse credentials file',
        'PARSE_ERROR'
      );
    }
    throw error;
  }
}

/**
 * Read raw credentials from the system based on platform.
 * Does not check for expiration.
 */
async function readRawCredentials(): Promise<ClaudeCodeCredentials | null> {
  if (isMacOS()) {
    return readFromKeychain();
  } else if (isLinux()) {
    return readFromFilesystem();
  } else {
    throw new ClaudeCodeCredentialsError(
      `Unsupported platform: ${os.platform()}. Only macOS and Linux are supported.`,
      'UNSUPPORTED_PLATFORM'
    );
  }
}

/**
 * Read Claude Code OAuth credentials from the system.
 *
 * On macOS: Reads from Keychain using 'keytar' package
 * On Linux: Reads from ~/.claude/.credentials.json
 *
 * @returns The access token and metadata if found and not expired, null otherwise
 *
 * @example
 * ```typescript
 * const credentials = await readClaudeCodeCredentials();
 * if (credentials) {
 *   console.log('Found valid credentials');
 *   // Use credentials.accessToken for API calls
 * } else {
 *   console.log('No valid credentials found');
 * }
 * ```
 */
export async function readClaudeCodeCredentials(): Promise<CredentialResult | null> {
  const credentials = await readRawCredentials();

  if (!credentials?.claudeAiOauth) {
    return null;
  }

  const oauth = credentials.claudeAiOauth;

  // Check if credentials are expired
  if (isExpired(oauth.expiresAt)) {
    return null;
  }

  return {
    accessToken: oauth.accessToken,
    expiresAt: oauth.expiresAt,
    scopes: oauth.scopes,
    subscriptionType: oauth.subscriptionType,
    rateLimitTier: oauth.rateLimitTier,
  };
}

/**
 * Get the raw credentials without expiration check.
 * Useful for debugging or when you want to handle expiration yourself.
 *
 * @returns The full credentials object if found, null otherwise
 */
export async function readClaudeCodeCredentialsRaw(): Promise<ClaudeCodeCredentials | null> {
  return readRawCredentials();
}

/**
 * Check if Claude Code credentials exist and are valid.
 *
 * @returns true if valid credentials exist, false otherwise
 */
export async function hasValidClaudeCodeCredentials(): Promise<boolean> {
  const credentials = await readClaudeCodeCredentials();
  return credentials !== null;
}

/**
 * Check if Claude Code credentials are available.
 * Returns detailed information about availability status.
 *
 * @returns Object with availability status and additional details
 */
export async function checkCredentialsAvailable(): Promise<CheckCredentialsResult> {
  try {
    const credentials = await readRawCredentials();

    if (!credentials?.claudeAiOauth) {
      return {
        available: false,
        reason: 'Claude Code credentials not found',
      };
    }

    const oauth = credentials.claudeAiOauth;

    if (isExpired(oauth.expiresAt)) {
      return {
        available: false,
        reason: 'Token has expired',
      };
    }

    return {
      available: true,
      expiresAt: oauth.expiresAt,
    };
  } catch (error) {
    if (error instanceof ClaudeCodeCredentialsError) {
      return {
        available: false,
        reason: error.message,
      };
    }
    return {
      available: false,
      reason: 'Unknown error checking credentials',
    };
  }
}

/**
 * Get the access token from Claude Code credentials.
 * Throws an error if credentials are not available or expired.
 *
 * @returns The access token string
 * @throws ClaudeCodeCredentialsError if credentials are not available
 */
export async function getAccessToken(): Promise<string> {
  const credentials = await readRawCredentials();

  if (!credentials?.claudeAiOauth) {
    throw new ClaudeCodeCredentialsError(
      'Claude Code credentials not found',
      'CREDENTIALS_NOT_FOUND'
    );
  }

  const oauth = credentials.claudeAiOauth;

  if (isExpired(oauth.expiresAt)) {
    throw new ClaudeCodeCredentialsError(
      'Token has expired',
      'TOKEN_EXPIRED',
      oauth.expiresAt
    );
  }

  return oauth.accessToken;
}
