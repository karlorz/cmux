import { stackClientApp } from "@/lib/stack";
import { useUser } from "@stackframe/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/profile")({
  component: ProfileComponent,
});

function ProfileComponent() {
  const user = useUser({ or: "return-null" });

  return (
    <div className="flex flex-col grow overflow-auto">
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage your personal information
          </p>
        </div>

        {/* Profile Sections */}
        <div className="space-y-6">
          {/* Personal Information */}
          <div className="bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                Personal Information
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-start space-x-6 mb-6">
                <div className="relative">
                  <div className="w-24 h-24 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center justify-center overflow-hidden">
                    {user?.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl text-neutral-500 dark:text-neutral-400">
                        {user?.displayName?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 pt-2">
                  <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
                    {user?.displayName || "Unknown"}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {user?.primaryEmail || "No email"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Settings */}
          <div className="bg-white dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                Account
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    Account Settings
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Manage password, security, and connected accounts
                  </p>
                </div>
                <button
                  onClick={() => {
                    stackClientApp.redirectToAccountSettings();
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Manage Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
