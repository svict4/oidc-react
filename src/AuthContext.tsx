import React, { FC, useState, useEffect } from 'react';
import { UserManager, User } from 'oidc-client';
import {
  Location,
  AuthProviderProps,
  AuthContextProps,
} from './AuthContextInterface';

export const AuthContext = React.createContext<AuthContextProps | null>(null);

/**
 * @private
 * @hidden
 * @param location
 */
export const hasCodeInUrl = (location: Location): boolean => {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace('#', '?'));

  return Boolean(
    searchParams.get('code') ||
      searchParams.get('id_token') ||
      searchParams.get('session_state') ||
      hashParams.get('code') ||
      hashParams.get('id_token') ||
      hashParams.get('session_state'),
  );
};

/**
 * @private
 * @hidden
 * @param props
 */
export const initUserManager = (props: AuthProviderProps): UserManager => {
  if (props.userManager) return props.userManager;
  const {
    authority,
    clientId,
    clientSecret,
    redirectUri,
    responseType,
    scope,
    automaticSilentRenew,
  } = props;
  return new UserManager({
    authority,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    silent_redirect_uri: redirectUri,
    post_logout_redirect_uri: redirectUri,
    response_type: responseType || 'code',
    scope: scope || 'openid',
    loadUserInfo: true,
    automaticSilentRenew,
  });
};

/**
 *
 * @param props AuthProviderProps
 */
export const AuthProvider: FC<AuthProviderProps> = ({
  children,
  autoSignIn = true,
  onBeforeSignIn,
  onSignIn,
  onSignOut,
  location = window.location,
  ...props
}) => {
  const [userData, setUserData] = useState<User | null>(null);
  const method = "OIDC";

  const userManager = initUserManager(props);

  const signOutHooks = async (): Promise<void> => {
    setUserData(null);
    onSignOut && onSignOut();
  };

  useEffect(() => {
    const getUser = async (): Promise<void> => {
      /**
       * Check if the user is returning back from OIDC.
       */
      if (hasCodeInUrl(location)) {
        const user = await userManager.signinCallback();
        setUserData(user);
        onSignIn && onSignIn(user);
        return;
      }

      const user = await userManager!.getUser();
      if ((!user || user.expired) && autoSignIn) {
        onBeforeSignIn && onBeforeSignIn();
        userManager.signinRedirect();
      } else {
        setUserData(user);
      }
      return;
    };
    getUser();
  }, [location]);

  useEffect(() => {
    // for refreshing react state when new state is available in e.g. session storage
    const updateUserData = async () => {
      const user = await userManager.getUser();
      setUserData(user);
    }

    userManager.events.addUserLoaded(updateUserData);

    return () => userManager.events.removeUserLoaded(updateUserData);
  }, [])

  return (
    <AuthContext.Provider
      value={{
        login: async (args: unknown): Promise<void> => {
          await userManager.signinRedirect(args);
        },
        logout: async (): Promise<void> => {
          await userManager!.removeUser();
          await signOutHooks();
        },
        signOutRedirect: async (args?: unknown): Promise<void> => {
          await userManager!.signoutRedirect(args);
          await signOutHooks();
        },
        userManager,
        userData,
        user: {
          id: userData?.profile.name,
          avatar: userData?.profile.picture,
          email: userData?.profile.email,
          name: userData?.profile.name
        },
        isAuthenticated: userData?.expired ? false : (JSON.parse(
          localStorage.getItem(
            `oidc.user:${props.authority}:${props.clientId}`
        )!)?.expires_at <
          new Date().getTime() / 1000
        ),
        method
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
