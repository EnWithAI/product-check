/** Largest YAML input accepted, in bytes. */
export declare const MAX_YAML_BYTES: number;
/** Parses every document in a YAML or JSON text into plain values. */
export declare function readYaml(text: string, source: string): unknown[];
