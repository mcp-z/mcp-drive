#!/usr/bin/env node
/**
 * Test script for generated example configs
 * Validates that configs work by connecting to server and testing search functionality
 */

import { createServerRegistry, type ServersConfig } from '@mcp-z/client';
import * as fs from 'fs';
import * as path from 'path';

const WAIT_MS = 20000;

/**
 * Clear token cache to force fresh authentication
 */
function clearTokenCache(): void {
  const cachePath = path.join('examples', '.mcp-z');
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true });
    console.log('   🧹 Cleared token cache - forcing fresh auth');
  }
}

async function testConfig(configFile: string): Promise<void> {
  const configPath = path.join('examples', configFile);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ ${configFile}: File not found`);
    return;
  }

  const config: ServersConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Get the first server config
  const serverName = Object.keys(config)[0];
  if (!serverName) {
    console.error(`❌ ${configFile}: No servers in config`);
    return;
  }

  const serverConfig = config[serverName];
  if (!serverConfig) {
    console.error(`❌ ${configFile}: Server config not found`);
    return;
  }

  console.log(`\n🧪 Testing ${configFile}...`);
  console.log(`   Server: ${serverName}`);
  console.log(`   Transport: ${serverConfig.type || 'stdio'}`);
  if (serverConfig.command || serverConfig.start?.command) {
    const cmd = serverConfig.start?.command || serverConfig.command || '';
    const args = (serverConfig.start?.args || serverConfig.args || []).join(' ');
    console.log(`   Command: ${cmd} ${args}`);
  }

  // Clear token cache to force fresh auth flow
  clearTokenCache();

  // Spawn servers using registry (not CLI wrapper)
  // Use both dialects to test start blocks + stdio servers
  // cwd should be the examples directory (where config files are)
  const registry = createServerRegistry(config, {
    cwd: 'examples',
    dialects: ['servers', 'start'],
  });

  try {
    // Connect to server using cluster
    const client = await registry.connect(serverName);
    console.log('   ✅ Connected to server');

    // Test: List tools
    const tools = await client.listTools();
    console.log(`   ✅ Listed ${tools.tools.length} tools`);

    // Test: Search for files with timeout to prevent hanging
    try {
      // Create a timeout promise to prevent infinite hanging
      const toolCallPromise = client.callTool({
        name: 'files-search',
        arguments: { query: {} }, // Empty query to get any files
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Tool call timed out after ${WAIT_MS / 1000}s`)), WAIT_MS);
      });

      const searchResponse = await Promise.race([toolCallPromise, timeoutPromise]);

      let resultText: string;
      try {
        resultText = searchResponse.text();
      } catch (error) {
        throw new Error(`Failed to read search response: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check if the result is an MCP error (returned as text, not thrown)
      if (resultText.startsWith('MCP error')) {
        throw new Error(resultText);
      }

      // Parse the result - add better error handling
      let resultData: { files?: Array<{ name: string }> };
      try {
        resultData = JSON.parse(resultText);
      } catch (_parseError) {
        // Show what we got instead of JSON
        console.log(`   📝 Tool response: ${resultText}`);
        throw new Error(`Tool returned non-JSON response: ${resultText}`);
      }
      const fileCount = resultData.files?.length || 0;

      if (fileCount > 0) {
        console.log(`   ✅ Search found ${fileCount} file(s)`);
        console.log(`   📄 First file: ${resultData.files[0].name}`);
      } else {
        console.log('   ⚠️  Search returned 0 files');
      }

      console.log(`   ✅ ${configFile}: All tests passed`);
    } finally {
      // Close client connection
      await client.close();
    }
  } catch (error) {
    console.error(`   ❌ ${configFile}: Test failed`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    // Shutdown registry (stops all spawned processes)
    await registry.close();
  }
}

async function main() {
  console.log('🔧 Testing Generated Example Configs\n');
  console.log('='.repeat(60));

  const examplesDir = 'examples';

  if (!fs.existsSync(examplesDir)) {
    console.error(`❌ Examples directory not found: ${examplesDir}`);
    console.error('   Run "mcp-z config generate-combinations" first');
    process.exit(1);
  }

  const configFiles = fs
    .readdirSync(examplesDir)
    .filter((f) => f.startsWith('.mcp.') && f.endsWith('.json'))
    .sort();

  if (configFiles.length === 0) {
    console.error('❌ No config files found in examples/');
    console.error('   Run "mcp-z config generate-combinations" first');
    process.exit(1);
  }

  console.log(`Found ${configFiles.length} config file(s):\n`);

  let passed = 0;
  let failed = 0;

  for (const configFile of configFiles) {
    try {
      await testConfig(configFile);
      passed++;
    } catch (error) {
      failed++;
      console.error(`\n❌ ${configFile} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('\n📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total: ${configFiles.length}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
  process.exit(0); // Force clean exit
}

main().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
