const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { dirname, resolve } = require('path');

const projectRoot = resolve(dirname(__filename), '../..');

async function compileProtobuf() {
  try {
    if (!existsSync(resolve(projectRoot, 'proto/whatsapp.proto'))) {
      throw new Error('whatsapp.proto file not found');
    }

    console.log('🔄 Generating JavaScript code (CommonJS)...');
    // Mudança: removido -w es6 para gerar CommonJS ao invés de ES6 modules
    execSync(`yarn pbjs -t static-module --no-bundle -o ${resolve(projectRoot, 'dist/index.js')} ${resolve(projectRoot, 'proto/whatsapp.proto')}`, {
      stdio: 'inherit'
    });

    console.log('🔄 Fixing imports...');
    const filePath = resolve(projectRoot, 'dist/index.js');
    let content = readFileSync(filePath, 'utf8');

    // Fix para CommonJS - substitui require por require com .js se necessário
    content = content.replace(
      /require\(['"]protobufjs\/minimal['"]\)/g,
      'require("protobufjs/minimal.js")'
    );

    // Outros possíveis fixes para CommonJS
    content = content.replace(
      /require\(['"]protobufjs['"]\)/g,
      'require("protobufjs")'
    );

    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed imports in ${filePath}`);

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

if (require.main === module) {
  compileProtobuf();
}

module.exports = { compileProtobuf };