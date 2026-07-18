const React = require('react');

const createIcon = (name) => {
  const Icon = ({ className, ...props }) => React.createElement('span', {
    'data-testid': `${name}-icon`,
    className,
    ...props,
  });

  Icon.displayName = name;
  return Icon;
};

module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }

      if (prop === 'default') {
        return createIcon('LucideIcon');
      }

      return createIcon(String(prop));
    },
  }
);
