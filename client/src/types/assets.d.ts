// Vite's default client types only cover lowercase asset extensions; user
// uploads can land with uppercase extensions (e.g. IMG_1234.PNG).
declare module "*.PNG" {
  const src: string;
  export default src;
}
declare module "*.JPG" {
  const src: string;
  export default src;
}
declare module "*.JPEG" {
  const src: string;
  export default src;
}
