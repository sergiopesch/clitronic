const IS_DEV = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: unknown[]) => {
    if (IS_DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
