import { formatFiles, joinPathFragments, names, Tree } from '@nrwl/devkit';
import { readdir, readFile } from 'fs-extra';
import { basename, extname, join } from 'path';
import { cwd } from 'process';
import * as ts from 'typescript';

async function loadSvgsInPath(
  path: string,
  prefix: string,
  suffix: string = '',
): Promise<Record<string, string>> {
  // load all the svg files within the path
  const files = (await readdir(path)).filter(file => extname(file) === '.svg');

  // read the contents of each file
  const output: Record<string, string> = {};

  for (const file of files) {
    const iconName = names(
      prefix + '-' + basename(file, '.svg') + suffix,
    ).className;
    output[iconName] = await readFile(join(path, file), 'utf8');
  }

  return output;
}

function createIconDeclaration(name: string, svg: string): ts.Node {
  return ts.factory.createVariableStatement(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier(names(name).className),
          undefined,
          undefined,
          ts.factory.createNoSubstitutionTemplateLiteral(svg.trim()),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function createIconNameType(names: string[]): ts.Node {
  const node = ts.factory.createTypeAliasDeclaration(
    undefined,
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier('HeroIconName'),
    undefined,
    ts.factory.createUnionTypeNode(
      names.map(name =>
        ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(name)),
      ),
    ),
  );

  walk(node, [convertToSingleQuote]);

  return node;
}

async function createIconset(iconset: Iconset): Promise<string> {
  const icons = await loadSvgsInPath(
    iconset.from,
    iconset.prefix,
    iconset.suffix,
  );
  const printer = ts.createPrinter();
  const sourceFile = ts.createSourceFile(
    'icons.ts',
    '',
    ts.ScriptTarget.ESNext,
  );

  const output: string[] = [];

  for (const icon in icons) {
    const node = createIconDeclaration(icon, icons[icon]);
    const content = printer.printNode(
      ts.EmitHint.Unspecified,
      node,
      sourceFile,
    );
    output.push(content);
  }

  const typeDefinition = createIconNameType(Object.keys(icons));
  const typeOutput = printer.printNode(
    ts.EmitHint.Unspecified,
    typeDefinition,
    sourceFile,
  );

  output.push(typeOutput);

  return output.join('\n');
}

function convertToSingleQuote(node: ts.Node): void {
  if (ts.isStringLiteral(node)) {
    // tslint:disable-next-line:no-any
    (node as any).singleQuote = true;
  }
}

function walk(node: ts.Node, cbArray: Array<(node: ts.Node) => void>): void {
  ts.forEachChild(node, n => {
    for (const cb of cbArray) {
      cb(n);
    }
    walk(n, cbArray);
  });
}

interface Iconset {
  from: string;
  to: string;
  prefix: string;
  suffix?: string;
}

const iconsets: Iconset[] = [
  {
    from: joinPathFragments(cwd(), 'node_modules', 'heroicons', 'outline'),
    to: joinPathFragments('packages', 'heroicons', 'src', 'outline.ts'),
    prefix: 'heroicon',
  },
  {
    from: joinPathFragments(cwd(), 'node_modules', 'heroicons', 'solid'),
    to: joinPathFragments('packages', 'heroicons', 'src', 'solid.ts'),
    prefix: 'heroicon',
    suffix: 'solid',
  },
  {
    from: joinPathFragments(
      cwd(),
      'node_modules',
      'feather-icons',
      'dist',
      'icons',
    ),
    to: joinPathFragments('packages', 'feather-icons', 'src', 'index.ts'),
    prefix: 'feather',
  },
];

export default async function (tree: Tree): Promise<void> {
  for (const iconset of iconsets) {
    tree.write(iconset.to, await createIconset(iconset));
  }

  await formatFiles(tree);
}
