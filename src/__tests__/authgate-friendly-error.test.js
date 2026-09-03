// @ts-nocheck
// components/AuthGate.js's friendlyAuthError() had zero test coverage despite being live --
// called at 5 sites across the login/forgot-password/set-password screens to turn a raw
// Supabase auth error into user-facing copy.
import { describe, it, expect } from 'vitest';
import { friendlyAuthError } from '../components/AuthGate.js';

describe('friendlyAuthError', () => {
  it('returns an empty string for a falsy error', () => {
    expect(friendlyAuthError(null)).toBe('');
    expect(friendlyAuthError(undefined)).toBe('');
  });

  it('maps invalid-credentials errors to a "try again or forgot password" message', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' }))
      .toBe('Incorrect email or password. Try again or use "Forgot password?"');
    expect(friendlyAuthError({ message: 'invalid_credentials' }))
      .toBe('Incorrect email or password. Try again or use "Forgot password?"');
  });

  it('maps an unconfirmed-email error to a check-your-inbox message', () => {
    expect(friendlyAuthError({ message: 'Email not confirmed' }))
      .toBe('Email address not confirmed. Check your inbox for a confirmation email, then try again.');
  });

  it('maps rate-limit errors to a wait-a-minute message', () => {
    expect(friendlyAuthError({ message: 'Too many requests' }))
      .toBe('Too many attempts — please wait a minute and try again.');
    expect(friendlyAuthError({ message: 'rate limit exceeded' }))
      .toBe('Too many attempts — please wait a minute and try again.');
  });

  it('maps a no-account error to a no-account-found message', () => {
    expect(friendlyAuthError({ message: 'User not found' }))
      .toBe('No account found for that email address.');
  });

  it('maps an invalid/expired token error to a request-a-new-one message', () => {
    expect(friendlyAuthError({ message: 'Token has expired' }))
      .toBe('Code is invalid or expired — request a new one.');
    expect(friendlyAuthError({ message: 'Invalid token' }))
      .toBe('Code is invalid or expired — request a new one.');
  });

  it('maps a same-password error to a must-be-different message', () => {
    expect(friendlyAuthError({ message: 'New password should be different from the same password' }))
      .toBe('New password must be different from the current one.');
  });

  it('falls back to the raw message for an unrecognized error', () => {
    expect(friendlyAuthError({ message: 'Some unmapped Supabase error' }))
      .toBe('Some unmapped Supabase error');
  });

  it('falls back to a generic message when the error has no message at all', () => {
    expect(friendlyAuthError({})).toBe('Something went wrong. Try again.');
  });

  it('matching is case-insensitive', () => {
    expect(friendlyAuthError({ message: 'INVALID LOGIN CREDENTIALS' }))
      .toBe('Incorrect email or password. Try again or use "Forgot password?"');
  });
});
