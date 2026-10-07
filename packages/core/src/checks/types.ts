export type CheckName = "cursor" | "overflow" | "contrast" | "console";

/** One problem a check found on a page, before the runner says where. */
export interface Issue {
  /** The element at fault, such as `button "Ajouter"`, when there is one. */
  element?: string;
  message: string;
}

export interface Finding extends Issue {
  check: CheckName;
  url: string;
  width: number;
}
