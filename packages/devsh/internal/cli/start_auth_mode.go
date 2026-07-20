package cli

// StartAuthMode describes whether start should record sandbox ownership
// and/or inject setup-providers auth into the box.
type StartAuthMode struct {
	RecordOwnership bool
	SetupProviders  bool
	// Warning is a non-fatal note for the operator (e.g. flag interactions).
	Warning string
}

// ResolveStartAuthMode maps CLI flags to ownership/auth behavior.
//
// Precedence:
//   - --no-auth always wins: skip ownership and setup-providers.
//   - --clean: record ownership, skip setup-providers.
//   - --mirror-local without --clean/--no-auth: auto-imply clean for auth
//     injection only (still record ownership) so setup-providers cannot
//     overwrite mirrored agent config.
//   - default: record ownership and run setup-providers.
func ResolveStartAuthMode(noAuth, clean, mirrorLocal bool) StartAuthMode {
	if noAuth {
		mode := StartAuthMode{
			RecordOwnership: false,
			SetupProviders:  false,
		}
		if clean {
			mode.Warning = "--no-auth wins over --clean: skipping ownership and provider auth"
		}
		return mode
	}

	if clean {
		return StartAuthMode{
			RecordOwnership: true,
			SetupProviders:  false,
		}
	}

	if mirrorLocal {
		return StartAuthMode{
			RecordOwnership: true,
			SetupProviders:  false,
			Warning:         "--mirror-local implies --clean for provider auth (ownership still recorded)",
		}
	}

	return StartAuthMode{
		RecordOwnership: true,
		SetupProviders:  true,
	}
}
