import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');



async function compileProtobuf() {
  try {
    if (!existsSync(resolve(projectRoot, 'proto/whatsapp.proto'))) {
      throw new Error('whatsapp.proto file not found');
    }

    console.log('🔄 Generating JavaScript code...');
    execSync(`yarn pbjs -t static-module -w es6 --no-bundle -o ${resolve(projectRoot, 'dist/index.js')} ${resolve(projectRoot, 'proto/whatsapp.proto')}`, {
      stdio: 'inherit'
    });

    console.log('🔄 Fixing ES module imports...');
    const filePath = resolve(projectRoot, 'dist/index.js');
    let content = readFileSync(filePath, 'utf-8');


    content = content.replace(
      /from ['"]protobufjs\/minimal['"]/g,
      'from "protobufjs/minimal.js"'
    );

    writeFileSync(filePath, content);

    console.log('🔄 Generating TypeScript definitions...');
    execSync(`yarn pbts -o ${resolve(projectRoot, 'dist/index.d.ts')} ${resolve(projectRoot, 'dist/index.js')}`, {
      stdio: 'inherit'
    });

    console.log('✅ Compilation completed successfully!');

  } catch (error) {
    console.error('❌ Compilation error:', error.message);
    process.exit(1);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  compileProtobuf();
}

export { compileProtobuf };