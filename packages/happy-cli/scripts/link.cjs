#!/usr/bin/env node
/**
 * link.cjs - Create symlink for happy (stable) command
 *
 * This script creates a symlink for the happy command pointing to the local
 * development version, overriding the npm-installed version.
 *
 * Usage: yarn link:stable
 *
 * What it does:
 * 1. Finds the global npm bin directory
 * 2. Creates/updates a symlink: happy -> ./bin/happy.mjs
 *
 * To undo: yarn unlink:stable
 */

const { execFileSync } = require('child_process');
const { join, dirname } = require('path');
const fs = require('fs');

const projectRoot = dirname(__dirname);
const binSource = join(projectRoot, 'bin', 'happy.mjs');

// Get the action from command line args
const action = process.argv[2] || 'link';

function getGlobalBinDir() {
    // Try npm global bin first using execFileSync (safer than execSync)
    try {
        const npmBin = execFileSync('npm', ['bin', '-g'], { encoding: 'utf8' }).trim();
        if (fs.existsSync(npmBin)) {
            return npmBin;
        }
    } catch (e) {
        // Fall through to alternatives
    }

    // Common locations by platform
    if (process.platform === 'darwin') {
        // macOS with Homebrew Node (Apple Silicon)
        const homebrewBin = '/opt/homebrew/bin';
        if (fs.existsSync(homebrewBin)) {
            return homebrewBin;
        }
        // Intel Mac Homebrew
        const homebrewUsrBin = '/usr/local/bin';
        if (fs.existsSync(homebrewUsrBin)) {
            return homebrewUsrBin;
        }
    }

    // Fallback to /usr/local/bin
    return '/usr/local/bin';
}

function link() {
    const globalBin = getGlobalBinDir();
    const binTarget = join(globalBin, 'happy');

    console.log('Creating symlink for happy...');
    console.log(`  Source: ${binSource}`);
    console.log(`  Target: ${binTarget}`);

    // Check if source exists
    if (!fs.existsSync(binSource)) {
        console.error(`\n❌ Error: ${binSource} does not exist.`);
        console.error("   Run 'yarn build' first to compile the project.");
        process.exit(1);
    }

    // Remove existing symlink or file
    try {
        const stat = fs.lstatSync(binTarget);
        if (stat.isSymbolicLink() || stat.isFile()) {
            fs.unlinkSync(binTarget);
            console.log(`  Removed existing: ${binTarget}`);
        }
    } catch (e) {
        // File doesn't exist, that's fine
    }

    // Create the symlink
    try {
        fs.symlinkSync(binSource, binTarget);
        console.log('\n✅ Successfully linked happy to local version');
        console.log('\nNow you can use:');
        console.log('  happy  → local development version');
        console.log('\nTo undo: yarn unlink:stable');
    } catch (e) {
        if (e.code === 'EACCES') {
            console.error('\n❌ Permission denied. Try running with sudo:');
            console.error('   sudo yarn link:stable');
        } else {
            console.error(`\n❌ Error creating symlink: ${e.message}`);
        }
        process.exit(1);
    }
}

function unlink() {
    const globalBin = getGlobalBinDir();
    const binTarget = join(globalBin, 'happy');

    console.log('Removing happy symlink...');

    try {
        const stat = fs.lstatSync(binTarget);
        if (stat.isSymbolicLink()) {
            const linkTarget = fs.readlinkSync(binTarget);
            if (linkTarget === binSource || linkTarget.includes('happy-cli')) {
                fs.unlinkSync(binTarget);
                console.log('\n✅ Removed happy development symlink');
                console.log('\nTo restore npm version: npm install -g happy-coder');
            } else {
                console.log(`\n⚠️  happy symlink points elsewhere: ${linkTarget}`);
                console.log('   Not removing. Remove manually if needed.');
            }
        } else {
            console.log(`\n⚠️  ${binTarget} exists but is not a symlink.`);
            console.log('   Not removing. This may be the npm-installed version.');
        }
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log("\n✅ happy symlink doesn't exist (already removed or never created)");
        } else if (e.code === 'EACCES') {
            console.error('\n❌ Permission denied. Try running with sudo:');
            console.error('   sudo yarn unlink:stable');
            process.exit(1);
        } else {
            console.error(`\n❌ Error: ${e.message}`);
            process.exit(1);
        }
    }
}

// Main
if (action === 'unlink') {
    unlink();
} else {
    link();
}
