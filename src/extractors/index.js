import requestPromise from 'request-promise-native';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');


// Configuration object for better maintainability
const CONFIG = {
  baseURL: 'https://web.whatsapp.com',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:100.0) Gecko/20100101 Firefox/100.0',
  defaultOutputPath: resolve(projectRoot, 'proto/whatsapp.proto'),
  indentSize: 2,
  requestTimeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

// Global state
let whatsAppVersion = 'latest';

/**
 * Creates standardized request headers for WhatsApp web requests
 * @returns {Object} Request headers object
 */
const createRequestHeaders = () => ({
  'User-Agent': CONFIG.userAgent,
  'Sec-Fetch-Dest': 'script',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'same-origin',
  'Referer': `${CONFIG.baseURL}/`,
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.5',
});

/**
 * Makes HTTP request with retry logic
 * @param {string} url - URL to fetch
 * @param {Object} options - Request options
 * @param {number} attempt - Current attempt number
 * @returns {Promise<string>} Response data
 */
async function makeRequestWithRetry(url, options = {}, attempt = 1) {
  try {
    console.log(`📡 Fetching: ${url} (attempt ${attempt})`);

    const requestOptions = {
      headers: createRequestHeaders(),
      timeout: CONFIG.requestTimeout,
      ...options
    };

    return await requestPromise.get(url, requestOptions);
  } catch (error) {
    if (attempt < CONFIG.retryAttempts) {
      console.warn(`⚠️  Request failed, retrying in ${CONFIG.retryDelay}ms... (${error.message})`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      return makeRequestWithRetry(url, options, attempt + 1);
    }
    throw new Error(`Failed to fetch ${url} after ${CONFIG.retryAttempts} attempts: ${error.message}`);
  }
}

/**
 * Utility function to add prefix to each line
 * @param {string[]} lines - Array of lines
 * @param {string} prefix - Prefix to add
 * @returns {string[]} Modified lines
 */
const addPrefix = (lines, prefix) => lines.map(line => prefix + line);

/**
 * Recursively extracts all expressions from an AST node
 * @param {Object} node - AST node
 * @returns {Object[]} Array of expressions
 */
const extractAllExpressions = (node) => {
  if (!node) return [];

  const expressions = [node];
  const exp = node.expression;

  if (exp) {
    expressions.push(exp);
  }

  // Handle arguments with body
  if (node?.expression?.arguments?.length) {
    for (const arg of node.expression.arguments) {
      if (arg?.body?.body?.length) {
        for (const exp of arg.body.body) {
          expressions.push(...extractAllExpressions(exp));
        }
      }
    }
  }

  // Handle node body
  if (node?.body?.body?.length) {
    for (const exp of node.body.body) {
      if (exp.expression) {
        expressions.push(...extractAllExpressions(exp.expression));
      }
    }
  }

  // Handle expression sequences
  if (node.expression?.expressions?.length) {
    for (const exp of node.expression.expressions) {
      expressions.push(...extractAllExpressions(exp));
    }
  }

  return expressions;
};

/**
 * Extracts WhatsApp version from service worker
 * @param {string} serviceworker - Service worker content
 * @returns {string} Extracted version
 */
async function extractWhatsAppVersion(serviceworker) {
  const versionMatches = [...serviceworker.matchAll(/client_revision\\":([\d\.]+),/g)];

  console.log('🔍 Extracting WhatsApp version...');

  if (versionMatches.length === 0) {
    throw new Error('Could not find WhatsApp version in service worker');
  }

  const version = versionMatches[0][1];
  const waVersion = `2.3000.${version}`;

  await writeFile(resolve(projectRoot, 'data/whatsapp_version.json'), JSON.stringify([2, 3000, Number(version)]), 'utf8');

  console.log(`📱 Current WhatsApp version: ${waVersion}`);

  whatsAppVersion = waVersion;
  return waVersion;
}

/**
 * Extracts bootstrap URL from service worker
 * @param {string} serviceworker - Service worker content
 * @returns {string} Bootstrap URL
 */
function extractBootstrapURL(serviceworker) {
  const clearString = serviceworker.replaceAll('/*BTDS*/', '');
  const urlMatches = clearString.match(/(?<=importScripts\(["'])(.*?)(?=["']\);)/g);

  if (!urlMatches || urlMatches.length === 0) {
    throw new Error('Could not find bootstrap URL in service worker');
  }

  const bootstrapURL = new URL(urlMatches[0].replaceAll("\\", '')).href;
  console.log(`🔗 Found bootstrap URL: ${bootstrapURL}`);

  return bootstrapURL;
}

/**
 * Finds and parses WhatsApp application modules
 * @returns {Promise<Object[]>} Array of parsed modules
 */
async function findAppModules() {
  try {
    console.log('🔍 Starting module discovery...');

    // Fetch service worker
    const serviceworker = await makeRequestWithRetry(`${CONFIG.baseURL}/sw.js`);

    // Extract version and bootstrap URL
    extractWhatsAppVersion(serviceworker);
    const bootstrapURL = extractBootstrapURL(serviceworker);

    // Fetch bootstrap script
    const qrData = await makeRequestWithRetry(bootstrapURL);

    // Apply known patches
    console.log('🔧 Applying patches...');
    const patchedQrData = qrData.replaceAll(
      'LimitSharing$Trigger',
      'LimitSharing$TriggerType'
    );

    // Parse and filter modules
    console.log('📝 Parsing modules...');
    const qrModules = acorn.parse(patchedQrData).body;

    const filteredModules = qrModules.filter((module) => {
      const expressions = extractAllExpressions(module);
      return expressions?.find(expr => expr?.left?.property?.name === 'internalSpec');
    });

    console.log(`✅ Found ${filteredModules.length} relevant modules`);
    return filteredModules;

  } catch (error) {
    console.error('❌ Error in findAppModules:', error.message);
    throw error;
  }
}

/**
 * Builds cross-reference map for modules
 * @param {Object[]} modules - Array of modules
 * @returns {Object} Module information with cross-references
 */
function buildModuleCrossReferences(modules) {
  console.log('🔗 Building cross-references...');

  const modulesInfo = {};

  modules.forEach((module) => {
    const moduleName = module.expression.arguments[0].value;
    modulesInfo[moduleName] = { crossRefs: [] };

    walk.simple(module, {
      AssignmentExpression(node) {
        if (
          node &&
          node?.right?.type === 'CallExpression' &&
          node?.right?.arguments?.length === 1 &&
          node?.right?.arguments[0].type !== 'ObjectExpression'
        ) {
          modulesInfo[moduleName].crossRefs.push({
            alias: node.left.name,
            module: node.right.arguments[0].value,
          });
        }
      },
    });
  });

  return modulesInfo;
}

/**
 * Creates identifier processing functions
 * @returns {Object} Object containing utility functions
 */
function createIdentifierUtils() {
  const unspecName = (name) => name.endsWith('Spec') ? name.slice(0, -4) : name;
  const unnestName = (name) => name.split('$').slice(-1)[0];
  const getNesting = (name) => name.split('$').slice(0, -1).join('$');
  const makeRenameFunc = () => (name) => unspecName(name);

  return { unspecName, unnestName, getNesting, makeRenameFunc };
}

/**
 * Processes module identifiers and enums
 * @param {Object[]} modules - Array of modules
 * @param {Object} modulesInfo - Module information object
 * @returns {Object} Module indentation map
 */
function processModuleIdentifiers(modules, modulesInfo) {
  console.log('🏷️  Processing identifiers...');

  const { getNesting, makeRenameFunc } = createIdentifierUtils();
  const moduleIndentationMap = {};

  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const rename = makeRenameFunc();

    // Collect assignments
    const assignments = [];
    walk.simple(mod, {
      AssignmentExpression(node) {
        const left = node.left;
        if (
          left.property?.name &&
          !['internalSpec', 'internalDefaults', 'name'].includes(left.property.name)
        ) {
          assignments.push(left);
        }
      },
    });

    // Create blank identifiers
    const makeBlankIdent = (assignment) => {
      const key = rename(assignment?.property?.name);
      const indentation = getNesting(key);
      const value = { name: key };

      moduleIndentationMap[key] = moduleIndentationMap[key] || {};
      moduleIndentationMap[key].indentation = indentation;

      if (indentation.length) {
        moduleIndentationMap[indentation] = moduleIndentationMap[indentation] || {};
        moduleIndentationMap[indentation].members = moduleIndentationMap[indentation].members || new Set();
        moduleIndentationMap[indentation].members.add(key);
      }

      return [key, value];
    };

    modInfo.identifiers = Object.fromEntries(
      assignments.map(makeBlankIdent).reverse()
    );

    // Process enum aliases
    const enumAliases = {};
    walk.ancestor(mod, {
      Property(node, ancestors) {
        const fatherNode = ancestors[ancestors.length - 3];
        const fatherFather = ancestors[ancestors.length - 4];

        if (
          fatherNode?.type === 'AssignmentExpression' &&
          fatherNode?.left?.property?.name === 'internalSpec' &&
          fatherNode?.right?.properties?.length
        ) {
          const values = fatherNode.right.properties.map((p) => ({
            name: p.key.name,
            id: p.value.value,
          }));
          const nameAlias = fatherNode.left.name;
          enumAliases[nameAlias] = values;
        } else if (
          node?.key?.name &&
          fatherNode.arguments?.length > 0
        ) {
          const values = fatherNode.arguments[0]?.properties?.map((p) => ({
            name: p.key.name,
            id: p.value.value,
          }));
          const nameAlias = fatherFather?.left?.name || fatherFather?.id?.name;
          enumAliases[nameAlias] = values;
        }
      },
    });

    // Link enum values to identifiers
    walk.simple(mod, {
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          modInfo.identifiers?.[rename(node.left.property.name)]
        ) {
          const ident = modInfo.identifiers[rename(node.left.property.name)];
          ident.alias = node.right.name;
          ident.enumValues = enumAliases[ident.alias];
        }
      },
    });
  }

  return moduleIndentationMap;
}

/**
 * Processes protobuf message specifications
 * @param {Object[]} modules - Array of modules
 * @param {Object} modulesInfo - Module information object
 * @param {Object} moduleIndentationMap - Module indentation mapping
 */
function processMessageSpecifications(modules, modulesInfo, moduleIndentationMap) {
  console.log('📋 Processing message specifications...');

  const { makeRenameFunc, unnestName } = createIdentifierUtils();

  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const rename = makeRenameFunc();

    const findByAliasInIdentifier = (obj, alias) => {
      return Object.values(obj).find(item => item.alias === alias);
    };

    walk.simple(mod, {
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          node.left.property.name === 'internalSpec' &&
          node.right.type === 'ObjectExpression'
        ) {
          const targetIdent = Object.values(modInfo.identifiers).find(
            (v) => v.alias === node.left.object.name
          );

          if (!targetIdent) {
            console.warn(`⚠️  Unknown identifier alias: ${node.left.object.name}`);
            return;
          }

          // Partition properties
          const constraints = [];
          let members = [];

          for (const property of node.right.properties) {
            property.key.name = property.key.type === 'Identifier'
              ? property.key.name
              : property.key.value;

            const targetArray = property.key.name.startsWith('__') ? constraints : members;
            targetArray.push(property);
          }

          // Process members
          members = members.map(({ key: { name }, value: { elements } }) => {
            let type;
            const flags = [];

            const unwrapBinaryOr = (n) =>
              n.type === 'BinaryExpression' && n.operator === '|'
                ? [].concat(unwrapBinaryOr(n.left), unwrapBinaryOr(n.right))
                : [n];

            // Extract type and flags
            unwrapBinaryOr(elements[1]).forEach((m) => {
              if (
                m.type === 'MemberExpression' &&
                m.object.type === 'MemberExpression'
              ) {
                if (m.object.property.name === 'TYPES') {
                  type = m.property.name.toLowerCase();

                  // Handle map types
                  if (type === 'map') {
                    let typeStr = 'map<';
                    if (elements[2]?.type === 'ArrayExpression') {
                      const subElements = elements[2].elements;
                      subElements.forEach((element, index) => {
                        if (element?.property?.name) {
                          typeStr += element.property.name.toLowerCase();
                        } else {
                          const ref = findByAliasInIdentifier(modInfo.identifiers, element.name);
                          typeStr += ref?.name || 'unknown';
                        }
                        if (index < subElements.length - 1) {
                          typeStr += ', ';
                        }
                      });
                      typeStr += '>';
                      type = typeStr;
                    }
                  }
                } else if (m.object.property.name === 'FLAGS') {
                  flags.push(m.property.name.toLowerCase());
                }
              }
            });

            // Handle cross-references for message/enum types
            if (type === 'message' || type === 'enum') {
              const currLoc = ` from member '${name}' of message ${targetIdent.name}`;

              if (elements[2]?.type === 'Identifier') {
                const foundType = Object.values(modInfo.identifiers).find(
                  (v) => v.alias === elements[2].name
                )?.name;

                if (foundType) {
                  type = foundType;
                } else {
                  console.warn(`⚠️  Unable to find reference '${elements[2].name}'${currLoc}`);
                }
              } else if (elements[2]?.type === 'MemberExpression') {
                const crossRef = modInfo.crossRefs.find(
                  (r) => r.alias === elements[2]?.object?.name ||
                    r.alias === elements[2]?.object?.left?.name ||
                    r.alias === elements[2]?.object?.callee?.name
                );

                if (elements[1]?.property?.name === 'ENUM' &&
                  elements[2]?.property?.name?.includes('Type')) {
                  type = rename(elements[2].property.name);
                } else if (elements[2]?.property?.name?.includes('Spec')) {
                  type = rename(elements[2].property.name);
                } else if (
                  crossRef &&
                  crossRef.module !== '$InternalEnum' &&
                  modulesInfo[crossRef.module]?.identifiers?.[rename(elements[2].property.name)]
                ) {
                  type = rename(elements[2].property.name);
                } else {
                  console.warn(
                    `⚠️  Unable to resolve cross-reference '${elements[2]?.object?.name}' ` +
                    `or message '${elements[2]?.property?.name}'${currLoc}`
                  );
                }
              }
            }

            return { name, id: elements[0].value, type, flags };
          });

          // Process constraints (oneofs)
          constraints.forEach((constraint) => {
            if (
              constraint.key.name === '__oneofs__' &&
              constraint.value.type === 'ObjectExpression'
            ) {
              const newOneOfs = constraint.value.properties.map((property) => ({
                name: property.key.name,
                type: '__oneof__',
                members: property.value.elements.map((element) => {
                  const idx = members.findIndex((m) => m.name === element.value);
                  const member = members[idx];
                  members.splice(idx, 1);
                  return member;
                }),
              }));
              members.push(...newOneOfs);
            }
          });

          targetIdent.members = members;
        }
      },
    });
  }
}

/**
 * Generates Protocol Buffer string representations
 * @param {Object[]} modules - Array of modules
 * @param {Object} modulesInfo - Module information object
 * @param {Object} moduleIndentationMap - Module indentation mapping
 * @returns {Object} Map of decoded protobuf strings
 */
function generateProtobufStrings(modules, modulesInfo, moduleIndentationMap) {
  console.log('📝 Generating protobuf strings...');

  const { unnestName } = createIdentifierUtils();
  const decodedProtoMap = {};
  const spaceIndent = ' '.repeat(CONFIG.indentSize);

  // Helper functions for string generation
  const stringifyEnum = (ident, overrideName = null) =>
    [].concat(
      [`enum ${overrideName || ident.displayName || ident.name} {`],
      addPrefix(
        ident.enumValues.map((v) => `${v.name} = ${v.id};`),
        spaceIndent
      ),
      ['}']
    );

  const stringifyMessageSpecMember = (info, completeFlags, parentName = undefined) => {
    if (info.type === '__oneof__') {
      return [].concat(
        [`oneof ${info.name} {`],
        addPrefix(
          [].concat(
            ...info.members.map((m) => stringifyMessageSpecMember(m, false))
          ),
          spaceIndent
        ),
        ['}']
      );
    } else {
      // Handle packed flag
      let packedAttribute = '';
      if (info.flags.includes('packed')) {
        info.flags.splice(info.flags.indexOf('packed'), 1);
        packedAttribute = ' [packed=true]';
      }

      // Proto3 doesn't support required/optional for singular fields
      // Only repeated fields are allowed, and maps are inherently repeated
      let fieldLabel = '';

      if (info.flags.includes('repeated')) {
        fieldLabel = 'repeated ';
      }
      // Remove any proto2-style labels that aren't valid in proto3
      const validFlags = info.flags.filter(flag =>
        !['required', 'optional'].includes(flag)
      );

      if (validFlags.includes('repeated')) {
        fieldLabel = 'repeated ';
      }

      const indentation = moduleIndentationMap[info.type]?.indentation;
      let typeName = unnestName(info.type);

      if (indentation !== parentName && indentation) {
        typeName = `${indentation.replaceAll('$', '.')}.${typeName}`;
      }

      return [
        `${fieldLabel}${typeName} ${info.name} = ${info.id}${packedAttribute};`
      ];
    }
  };

  const stringifyMessageSpec = (ident) => {
    const members = moduleIndentationMap[ident.name]?.members;
    const result = [];

    result.push(
      `message ${ident.displayName || ident.name} {`,
      ...addPrefix(
        [].concat(
          ...ident.members.map((m) =>
            stringifyMessageSpecMember(m, true, ident.name)
          )
        ),
        spaceIndent
      )
    );

    // Add nested entities
    if (members?.size) {
      const sortedMembers = Array.from(members).sort();
      for (const memberName of sortedMembers) {
        // Get modInfo from the current context
        const currentModInfo = modulesInfo[Object.keys(modulesInfo).find(key =>
          modulesInfo[key].identifiers && modulesInfo[key].identifiers[memberName]
        )];

        if (currentModInfo) {
          const entity = currentModInfo.identifiers[memberName];
          if (entity) {
            const displayName = entity.name.slice(ident.name.length + 1);
            const entityWithDisplay = { ...entity, displayName };
            result.push(...addPrefix(getEntity(entityWithDisplay), spaceIndent));
          } else {
            console.warn(`⚠️  Missing nested entity: ${memberName}`);
          }
        }
      }
    }

    result.push('}', '');
    return result;
  };

  const getEntity = (entity) => {
    if (entity.members) {
      return stringifyMessageSpec(entity);
    } else if (entity.enumValues?.length) {
      return stringifyEnum(entity);
    } else {
      return [`// Unknown entity ${entity.name}`];
    }
  };

  const stringifyEntity = (entity) => ({
    content: getEntity(entity).join('\n'),
    name: entity.name,
  });

  // Process all modules
  for (const mod of modules) {
    const modInfo = modulesInfo[mod.expression.arguments[0].value];
    const identifiers = Object.values(modInfo?.identifiers || {});

    for (const entity of identifiers) {
      const { name, content } = stringifyEntity(entity);
      if (!moduleIndentationMap[name]?.indentation?.length) {
        decodedProtoMap[name] = content;
      }
    }
  }

  return decodedProtoMap;
}

/**
 * Ensures output directory exists
 * @param {string} filePath - Output file path
 */
async function ensureOutputDirectory(filePath) {
  const dir = dirname(resolve(filePath));

  if (!existsSync(dir)) {
    console.log(`📁 Creating directory: ${dir}`);
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Main function to extract WhatsApp protobuf schema
 * @param {string} outputPath - Optional output file path
 * @returns {Promise<string>} Path to generated file
 */
async function extractProtobuf(outputPath = CONFIG.defaultOutputPath) {
  const startTime = Date.now();
  console.log('🚀 Starting WhatsApp protobuf extraction...\n');

  try {
    // Find and parse modules
    const modules = await findAppModules();

    if (modules.length === 0) {
      throw new Error('No relevant modules found');
    }

    // Build module cross-references
    const modulesInfo = buildModuleCrossReferences(modules);

    // Process identifiers and enums
    const moduleIndentationMap = processModuleIdentifiers(modules, modulesInfo);

    // Process message specifications
    processMessageSpecifications(modules, modulesInfo, moduleIndentationMap);

    // Generate protobuf strings
    const decodedProtoMap = generateProtobufStrings(modules, modulesInfo, moduleIndentationMap);

    // Create final protobuf file content
    const sortedEntities = Object.keys(decodedProtoMap).sort();
    const protobufContent = sortedEntities.map(entity => decodedProtoMap[entity]).join('\n');

    const finalContent = [
      'syntax = "proto3";',
      'package proto;',
      '',
      `/// WhatsApp Version: ${whatsAppVersion}`,
      `/// Generated on: ${new Date().toISOString()}`,
      `/// Entities found: ${sortedEntities.length}`,
      '',
      protobufContent
    ].join('\n');

    // Ensure output directory exists and write file
    await ensureOutputDirectory(outputPath);
    await writeFile(outputPath, finalContent, 'utf8');

    const duration = Date.now() - startTime;
    const resolvedPath = resolve(outputPath);

    console.log('\n✅ Extraction completed successfully!');
    console.log(`📄 File: ${resolvedPath}`);
    console.log(`📊 Entities: ${sortedEntities.length}`);
    console.log(`📱 Version: ${whatsAppVersion}`);
    console.log(`⏱️  Duration: ${duration}ms`);

    return resolvedPath;

  } catch (error) {
    console.error('\n❌ Extraction failed:', error.message);
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputPath = process.argv[2];
  extractProtobuf(outputPath)
    .then(path => {
      console.log(`\n🎉 Success! Protobuf schema saved to: ${path}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error.message);
      process.exit(1);
    });
}

export {
  extractProtobuf,
  findAppModules,
  CONFIG,
  createRequestHeaders,
  makeRequestWithRetry
};