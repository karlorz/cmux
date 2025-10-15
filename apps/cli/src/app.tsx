import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import { fetchEnvironments, type EnvironmentSummary } from "./environments";
import {
  loadInitialConfig,
  sanitizeAppUrl,
  sanitizeBaseUrl,
  type CliConfig,
} from "./config";
import {
  authenticateUser,
  type StackAuthTokens,
  type StackUser,
} from "./stack-auth";

const REQUIRED_FIELD_MESSAGE = "This value cannot be empty.";

type FieldDescriptor = {
  key: keyof CliConfig;
  label: string;
  description?: string;
  placeholder?: string;
  sanitize?: (value: string) => string;
};

type Phase = "collect" | "authenticating" | "done" | "error";

type AuthResult = {
  tokens: StackAuthTokens;
  user: StackUser;
  environments: EnvironmentSummary[];
};

const fields: FieldDescriptor[] = [
  {
    key: "stackAuthBaseUrl",
    label: "Stack Auth API base URL",
    description: "Usually https://api.stack-auth.com",
    sanitize: sanitizeBaseUrl,
  },
  {
    key: "appUrl",
    label: "Stack app URL",
    description: "Used to confirm the login, e.g. https://www.cmux.sh",
    sanitize: sanitizeAppUrl,
  },
  {
    key: "apiBaseUrl",
    label: "cmux API base URL",
    description: "Origin that hosts the cmux API endpoints",
    sanitize: sanitizeBaseUrl,
  },
  {
    key: "projectId",
    label: "Stack Project ID",
    description: "Matches NEXT_PUBLIC_STACK_PROJECT_ID",
  },
  {
    key: "publishableClientKey",
    label: "Stack publishable client key",
    description: "Matches NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY",
  },
  {
    key: "teamSlugOrId",
    label: "Team slug or ID",
    description: "cmux team identifier used when fetching environments",
  },
];

const fieldCount = fields.length;

const getDisplayValue = (value: string): string => (value.length === 0 ? "<empty>" : value);

const getUserLabel = (user: StackUser): string => {
  if (user.display_name && user.display_name.trim().length > 0) {
    return user.display_name;
  }
  if (user.primary_email && user.primary_email.trim().length > 0) {
    return user.primary_email;
  }
  return user.id ?? "Unknown user";
};

export const App = (): ReactElement => {
  const [config, setConfig] = useState<CliConfig>(() => loadInitialConfig());
  const [phase, setPhase] = useState<Phase>("collect");
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [draftValue, setDraftValue] = useState<string>(() => config[fields[0]!.key]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<AuthResult | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStarted, setAuthStarted] = useState<boolean>(false);

  const appendLog = useCallback((message: string) => {
    setLogs((prevLogs) => [...prevLogs, message]);
  }, []);

  const activeField = useMemo(() => fields[currentIndex]!, [currentIndex]);

  useEffect(() => {
    setDraftValue(config[activeField.key]);
  }, [activeField.key, config]);

  const handleSubmitField = useCallback(
    (value: string) => {
      if (phase !== "collect") return;
      const sanitized = activeField.sanitize ? activeField.sanitize(value) : value.trim();
      if (sanitized.length === 0) {
        setInputError(REQUIRED_FIELD_MESSAGE);
        return;
      }

      setConfig((prevConfig) => ({ ...prevConfig, [activeField.key]: sanitized }));
      setInputError(null);

      if (currentIndex + 1 < fieldCount) {
        setCurrentIndex((prevIndex) => prevIndex + 1);
      } else {
        setPhase("authenticating");
        setLogs([]);
      }
    },
    [activeField, currentIndex, phase],
  );

  useEffect(() => {
    if (phase !== "authenticating" || authStarted) {
      return;
    }
    setAuthStarted(true);

    (async () => {
      try {
        appendLog("Starting Stack Auth login...");
        const { user, tokens } = await authenticateUser(config, appendLog);
        appendLog(`Authenticated as ${getUserLabel(user)}. Fetching environments...`);
        const environments = await fetchEnvironments({
          apiBaseUrl: config.apiBaseUrl,
          projectId: config.projectId,
          teamSlugOrId: config.teamSlugOrId,
          tokens,
        });
        appendLog(`Loaded ${environments.length} environment(s).`);
        setResult({ user, tokens, environments });
        setPhase("done");
        appendLog("Authentication flow complete.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        setAuthError(message);
        setPhase("error");
      }
    })();
  }, [appendLog, authStarted, config, phase]);

  const renderCollectedFields = (): ReactElement => (
    <Box flexDirection="column" marginBottom={1}>
      {fields.slice(0, currentIndex).map((field) => (
        <Text key={field.key}>
          {field.label}: {getDisplayValue(config[field.key])}
        </Text>
      ))}
    </Box>
  );

  if (phase === "collect") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">cmux CLI authentication</Text>
        {currentIndex > 0 && renderCollectedFields()}
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Step {currentIndex + 1} of {fieldCount}: {activeField.label}
          </Text>
          {activeField.description ? (
            <Text color="gray">{activeField.description}</Text>
          ) : null}
          <TextInput
            value={draftValue}
            onChange={(next) => setDraftValue(next)}
            onSubmit={handleSubmitField}
            placeholder={activeField.placeholder}
          />
          <Text color="gray">Press Enter to confirm.</Text>
          {inputError ? <Text color="red">{inputError}</Text> : null}
        </Box>
      </Box>
    );
  }

  if (phase === "authenticating") {
    return (
      <Box flexDirection="column">
        <Text color="cyan">cmux CLI authentication</Text>
        <Box marginTop={1}>
          <Text>
            <Spinner /> Authenticating...
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {logs.map((line: string, index: number) => (
            <Text key={`log-${index}`}>{line}</Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (phase === "done" && result) {
    return (
      <Box flexDirection="column">
        <Text color="green">Stack Auth login successful!</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>User: {getUserLabel(result.user)}</Text>
          {result.user.primary_email ? (
            <Text>Primary email: {result.user.primary_email}</Text>
          ) : null}
          <Text>Refresh token length: {result.tokens.refreshToken.length}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">Environments ({result.environments.length})</Text>
          {result.environments.length === 0 ? (
            <Text color="gray">No environments found for this team.</Text>
          ) : (
            result.environments.map((environment: EnvironmentSummary) => (
              <Text key={environment.id}>
                - {environment.name} ({environment.id})
              </Text>
            ))
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Authentication log:</Text>
          {logs.map((line: string, index: number) => (
            <Text key={`done-log-${index}`}>{line}</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Press Ctrl+C to exit.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red">Authentication failed.</Text>
      {authError ? <Text color="red">{authError}</Text> : null}
      {logs.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">Log output:</Text>
          {logs.map((line: string, index: number) => (
            <Text key={`error-log-${index}`}>{line}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
};

