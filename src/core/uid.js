// a short random id for slides, elements, assets and projects (a leaf module: no imports, so no cycles)
export const uid = () => Math.random().toString(36).slice(2, 10)
