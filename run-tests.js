// Register vscode mock before importing anything else
const path = require('path');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return path.join(__dirname, 'out', 'test', 'mock', 'vscode.js');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// Now run mocha
const Mocha = require('mocha');
const fs = require('fs');

const mocha = new Mocha({ timeout: 10000 });

function findTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTests(fullPath);
    } else if (entry.name.endsWith('.test.js')) {
      mocha.addFile(fullPath);
    }
  }
}

findTests(path.join(__dirname, 'out', 'test'));

mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
