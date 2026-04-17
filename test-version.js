// Quick test of isNewerVersion function
function isNewerVersion(remote, local) {
  try {
    const parseVersion = (ver) => {
      const [mainVer, preRelease] = ver.split('-');
      const parts = mainVer.split('.').map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
        preRelease: preRelease || null
      };
    };

    const r = parseVersion(remote);
    const l = parseVersion(local);

    if (r.major !== l.major) return r.major > l.major;
    if (r.minor !== l.minor) return r.minor > l.minor;
    if (r.patch !== l.patch) return r.patch > l.patch;

    if (r.preRelease === null && l.preRelease !== null) return true;
    if (r.preRelease !== null && l.preRelease === null) return false;

    return false;
  } catch { return false; }
}

// Test cases
const tests = [
  { remote: '1.7.1', local: '1.7.2-rc.1', expected: false, desc: '1.7.1 should NOT be newer than 1.7.2-rc.1' },
  { remote: '1.7.2', local: '1.7.2-rc.1', expected: true, desc: '1.7.2 should be newer than 1.7.2-rc.1' },
  { remote: '1.7.2-rc.2', local: '1.7.2-rc.1', expected: false, desc: 'rc.2 and rc.1 are same version (both pre-release)' },
  { remote: '1.8.0', local: '1.7.2-rc.1', expected: true, desc: '1.8.0 should be newer than 1.7.2-rc.1' },
  { remote: '1.7.2', local: '1.7.1', expected: true, desc: '1.7.2 should be newer than 1.7.1' },
];

console.log('Testing isNewerVersion function:\n');
tests.forEach(test => {
  const result = isNewerVersion(test.remote, test.local);
  const pass = result === test.expected;
  console.log(`${pass ? '✅' : '❌'} ${test.desc}`);
  console.log(`   isNewerVersion('${test.remote}', '${test.local}') = ${result} (expected: ${test.expected})\n`);
});
