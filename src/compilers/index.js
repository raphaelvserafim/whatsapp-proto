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
    const pbjsPath = resolve(projectRoot, 'node_modules/.bin/pbjs');
    execSync(`"${pbjsPath}" -t static-module -o ${resolve(projectRoot, 'dist/proto.js')} ${resolve(projectRoot, 'proto/whatsapp.proto')}`, {
      stdio: 'inherit'
    });

    console.log('🔄 Fixing imports...');
    const filePath = resolve(projectRoot, 'dist/proto.js');
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
    const pbtsPath = resolve(projectRoot, 'node_modules/.bin/pbts');
    execSync(`"${pbtsPath}" -o ${resolve(projectRoot, 'dist/proto.d.ts')} ${resolve(projectRoot, 'dist/proto.js')}`, {
      stdio: 'inherit'
    });

    console.log('🔄 Generating entry point with WHATSAPP_VERSION...');

    // Copia a versão atual do WhatsApp para dentro de dist/ (o diretório data/
    // não é publicado no npm), para que fique disponível em runtime.
    const versionPath = resolve(projectRoot, 'data/whatsapp_version.json');
    if (!existsSync(versionPath)) {
      throw new Error('whatsapp_version.json file not found');
    }
    const whatsappVersion = readFileSync(versionPath, 'utf8').trim();
    writeFileSync(resolve(projectRoot, 'dist/version.json'), whatsappVersion, 'utf8');

    // Wrapper CommonJS: reexporta o proto e anexa WHATSAPP_VERSION.
    const indexJs = `"use strict";
const proto = require("./proto.js");
const WHATSAPP_VERSION = require("./version.json");

proto.WHATSAPP_VERSION = WHATSAPP_VERSION;

module.exports = proto;
module.exports.WHATSAPP_VERSION = WHATSAPP_VERSION;
`;
    writeFileSync(resolve(projectRoot, 'dist/index.js'), indexJs, 'utf8');

    // Definições de tipos do entry point.
    const indexDts = `import * as $protobuf from "protobufjs";
export * from "./proto";

/** Versão atual do WhatsApp: [major, minor, patch]. */
export declare const WHATSAPP_VERSION: [number, number, number];
`;
    writeFileSync(resolve(projectRoot, 'dist/index.d.ts'), indexDts, 'utf8');
    console.log(`✅ Entry point generated (WHATSAPP_VERSION = ${whatsappVersion})`);

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