// Image imports resolve to a URL string (webpack `asset/resource`).
declare module '*.png' {
  const src: string;
  export default src;
}
