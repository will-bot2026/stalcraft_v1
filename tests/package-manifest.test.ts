import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

type PackageJson = {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const MANIFESTS = ['package.json', 'apps/web/package.json'] as const;

async function readManifest(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageJson;
}

describe('package manifests', () => {
  it('pin dependency versions instead of floating latest', async () => {
    const floatingSpecs: string[] = [];

    for (const path of MANIFESTS) {
      const manifest = await readManifest(path);
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
        for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
          if (spec === 'latest') {
            floatingSpecs.push(`${path} ${section}.${name}`);
          }
        }
      }
    }

    expect(floatingSpecs).toEqual([]);
  });

  it('declares the expected package manager for reproducible installs', async () => {
    const rootManifest = await readManifest('package.json');

    expect(rootManifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});
