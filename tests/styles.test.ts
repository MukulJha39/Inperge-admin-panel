import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every class the markup asks for must exist in the stylesheets.
 *
 * This has gone wrong repeatedly: `.checkbox`, `.filter-chips`, `.chip--button`,
 * `.link-button`, `.detail-grid`, `.table--compact` and others were all written into the
 * markup with nothing behind them. Nothing fails when that happens — the element simply
 * falls back to browser defaults, which is how a filter row ends up looking like three
 * grey system buttons. A test is the only thing that notices.
 */

const SRC = join(__dirname, '..', 'src');

function walk(dir: string, match: (file: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path, match));
    else if (match(entry)) found.push(path);
  }
  return found;
}

/**
 * Classes that are deliberately unstyled: wrappers that exist to group markup or to give
 * a script something to hold on to, whose appearance comes entirely from their children.
 */
const INTENTIONALLY_UNSTYLED = new Set([
  'donut__segments', // an SVG <g>; the animation lives on .donut__segment
  'nav-group', //       groups a nav section; .nav-group__label carries the styling
  'summary-item', //    groups a label and a value, both of which are styled
]);

function classesUsedInMarkup(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const files = walk(SRC, (file) => file.endsWith('.tsx'));

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const pattern = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      // Drop `${...}` interpolations: those build a class name at runtime and the literal
      // fragment around them is not a class on its own.
      const literal = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
      for (const name of literal.split(/\s+/)) {
        if (!name || name.endsWith('--')) continue;
        used.set(name, [...(used.get(name) ?? []), file]);
      }
    }
  }

  return used;
}

function classesDefinedInCss(): Set<string> {
  const files = walk(join(SRC, 'styles'), (file) => file.endsWith('.css'));
  const css = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  return new Set(css.match(/\.[A-Za-z0-9_-]+/g)?.map((selector) => selector.slice(1)) ?? []);
}

describe('stylesheets', () => {
  it('defines every class the markup uses', () => {
    const used = classesUsedInMarkup();
    const defined = classesDefinedInCss();

    const missing = [...used.entries()]
      .filter(([name]) => !defined.has(name) && !INTENTIONALLY_UNSTYLED.has(name))
      .map(([name, files]) => {
        const where = [...new Set(files)].map((file) => file.replace(`${SRC}\\`, '').replace(`${SRC}/`, ''));
        return `.${name} (used in ${where.join(', ')})`;
      });

    expect(missing).toEqual([]);
  });

  it('keeps the unstyled-on-purpose list honest', () => {
    // If one of these gains styling, it should leave the list rather than sit here
    // claiming an exemption it no longer needs.
    const defined = classesDefinedInCss();
    const nowStyled = [...INTENTIONALLY_UNSTYLED].filter((name) => defined.has(name));
    expect(nowStyled).toEqual([]);
  });

  it('finds a reasonable number of classes, so the scan is not silently empty', () => {
    expect(classesUsedInMarkup().size).toBeGreaterThan(100);
    expect(classesDefinedInCss().size).toBeGreaterThan(100);
  });
});
