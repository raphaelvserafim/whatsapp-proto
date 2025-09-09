const { extractProtobuf } = require("../extractors/index.js")
const { compileProtobuf } = require("../compilers/index.js")

async function build() {
  try {
    await extractProtobuf();

    await compileProtobuf();
    console.log('🏗️ Build process completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during build process:', error);
    process.exit(1);
  }
}

build();