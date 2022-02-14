const package_json = require('../package.json');

const dependencies = [
  ...Object.entries(package_json.dependencies),
  ...Object.entries(package_json.devDependencies),
];

let incorrectDeps = false;
for (const [dependency, version] of dependencies) {
  if (dependency.match(/@superfaceai/) && version.match(/-/)) {
    console.log(`${dependency} is not release version (${version})`);
    incorrectDeps = true;
  }
}

if (incorrectDeps) {
  process.exit(1);
}

console.log("Everything's peachy!");
