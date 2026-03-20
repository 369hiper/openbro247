declare module 'uuid' {
  export function v4(): string;
  export const v4: {
    (): string;
    default: () => string;
  };
}