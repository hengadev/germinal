import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALPHABET = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * Generate a cryptographically secure random password
 * @param length - Total password length (default 20, minimum 12)
 * @returns A secure random password with mixed case, numbers, and symbols
 */
export function generateSecurePassword(length: number = 20): string {
    if (length < 12) {
        throw new Error('Password length must be at least 12 characters');
    }

    // Ensure at least one of each character type
    const lowercase = randomCharFrom(ALPHABET.lowercase);
    const uppercase = randomCharFrom(ALPHABET.uppercase);
    const number = randomCharFrom(ALPHABET.numbers);
    const symbol = randomCharFrom(ALPHABET.symbols);

    // Fill the rest randomly
    const allChars = ALPHABET.lowercase + ALPHABET.uppercase + ALPHABET.numbers + ALPHABET.symbols;
    let remaining = '';
    for (let i = 0; i < length - 4; i++) {
        remaining += randomCharFrom(allChars);
    }

    // Shuffle and combine
    return shuffleString(lowercase + uppercase + number + symbol + remaining);
}

/**
 * Generate a cryptographically secure random token for password reset
 * @param bytes - Number of random bytes (default 32)
 * @returns A hex-encoded token
 */
export function generateResetToken(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
}

/**
 * Generate a random character from a string using crypto
 */
function randomCharFrom(str: string): string {
    const randomIndex = randomBytes(1).readUInt8(0) % str.length;
    return str[randomIndex];
}

/**
 * Shuffle a string using Fisher-Yates algorithm with crypto
 */
function shuffleString(str: string): string {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
        const randomIndex = randomBytes(1).readUInt8(0) % (i + 1);
        [arr[i], arr[randomIndex]] = [arr[randomIndex], arr[i]];
    }
    return arr.join('');
}

/**
 * Calculate password expiration time (default 24 hours from now)
 */
export function getResetExpiration(hours: number = 24): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}
