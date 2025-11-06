import { Providers } from "./providers";
import { RouterProviderWithAuth } from "./router";
import { QuitConfirmationDialogManager } from "./components/QuitConfirmationDialog";

export function App() {
  return (
    <Providers>
      <QuitConfirmationDialogManager />
      <RouterProviderWithAuth />
    </Providers>
  );
}
