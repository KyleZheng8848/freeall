import { renderPanel } from "./panel/shell.js";

export function panelPage(path = "/"): string {
  return renderPanel(path);
}
