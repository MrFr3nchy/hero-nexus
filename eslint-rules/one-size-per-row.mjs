/**
 * hero-nexus/one-size-per-row (improvements 12, design-language rule 10).
 *
 * Controls on one row share one `size`. Flags a JSX element whose
 * `className` contains `flex` and not `flex-col` when two of its direct
 * JSX children carry different literal `size="…"` props — an Input at `sm`
 * beside a Select at `md` is the mixed-height row the rule exists to stop.
 * Cheap on purpose: a literal on a direct child, nothing computed, nothing
 * nested, so what it flags is always the thing it says.
 */

function classNameOf(node) {
  const attr = node.openingElement.attributes.find(
    a => a.type === 'JSXAttribute' && a.name.name === 'className'
  );
  if (!attr || !attr.value) return null;
  if (attr.value.type === 'Literal') return String(attr.value.value);
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'TemplateLiteral'
  ) {
    return attr.value.expression.quasis.map(q => q.value.cooked).join(' ');
  }
  return null;
}

/**
 * HeroUI controls that take `size` and default to `md`. One of these with no
 * `size` beside one at `sm` is the mixed row — the default is a size too.
 */
const SIZED = new Set([
  'Input',
  'NumberInput',
  'Textarea',
  'Select',
  'Autocomplete',
  'Button',
  'DatePicker',
  'DateInput',
  'Switch',
  'Checkbox',
]);

function sizeOf(child) {
  if (child.type !== 'JSXElement') return null;
  const name = child.openingElement.name;
  const tag = name.type === 'JSXIdentifier' ? name.name : null;
  const attr = child.openingElement.attributes.find(
    a => a.type === 'JSXAttribute' && a.name.name === 'size'
  );
  if (!attr) return tag && SIZED.has(tag) ? 'md' : null;
  if (!attr.value) return null;
  // A control's size is a word (sm / md / lg). A number is a glyph's pixel
  // size, which has nothing to do with the row's height.
  if (attr.value.type === 'Literal' && typeof attr.value.value === 'string') {
    return attr.value.value;
  }
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal' &&
    typeof attr.value.expression.value === 'string'
  ) {
    return attr.value.expression.value;
  }
  return null;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Controls on one flex row share one HeroUI `size`.',
    },
    schema: [],
    messages: {
      mixed:
        'Controls on one row share one size: this row mixes size="{{a}}" and size="{{b}}" (a HeroUI control with no size is md). Use a ControlRow, or one size.',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const cls = classNameOf(node);
        if (!cls) return;
        const tokens = cls.split(/\s+/);
        const isRow =
          tokens.some(t => t === 'flex' || t === 'inline-flex') &&
          !tokens.some(t => t === 'flex-col' || t.endsWith(':flex-col'));
        if (!isRow) return;
        const sizes = new Map();
        for (const child of node.children) {
          const size = sizeOf(child);
          if (size !== null && !sizes.has(size)) sizes.set(size, child);
        }
        if (sizes.size < 2) return;
        const [a, b] = [...sizes.keys()];
        context.report({
          node: sizes.get(b),
          messageId: 'mixed',
          data: { a, b },
        });
      },
    };
  },
};

export default rule;
