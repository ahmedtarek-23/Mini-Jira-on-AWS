import React, { createContext, useContext, useMemo, useEffect } from 'react'
import { AuthProvider as OidcProvider, useAuth as useOidcAuth } from 'react-oidc-context'
import { WebStorageStateStore } from 'oidc-client-ts'

interface User {
  userId: string
  email: string
  role: 'manager' | 'employee'
  teamId?: string
}

interface AuthCtx {
  user: User | null
  login: () => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthCtx>({ user: null, login: () => {}, logout: () => {}, loading: true })

const POOL_ID = import.meta.env.VITE_COGNITO_POOL_ID || ''
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || ''
const DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || ''
const REGION = import.meta.env.VITE_COGNITO_REGION || 'us-east-1'

function parseJwt(token: string): any {
  try {
    let base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    if (padding) base64 += '='.repeat(4 - padding)
    const json = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function AuthSync({ children }: { children: React.ReactNode }) {
  const auth = useOidcAuth()

  useEffect(() => {
    if (auth.isLoading) return
    const token = auth.user?.id_token
    if (token) localStorage.setItem('id_token', token)
    else localStorage.removeItem('id_token')
  }, [auth.isLoading, auth.user?.id_token])

  const value = useMemo<AuthCtx>(() => {
    const claims = auth.user?.id_token ? parseJwt(auth.user.id_token) : null
    const roleClaim = String(claims?.['custom:role'] || 'employee').toLowerCase()
    const user: User | null = claims
      ? {
          userId: String(claims.sub || ''),
          email: String(claims.email || ''),
          role: roleClaim === 'manager' ? 'manager' : 'employee',
          teamId: claims['custom:teamId'] ? String(claims['custom:teamId']) : undefined,
        }
      : null

    return {
      user,
      login: () => { void auth.signinRedirect() },
      logout: () => {
        localStorage.removeItem('id_token')
        void auth.removeUser()
        const logoutUri = `${window.location.origin}/`
        window.location.href = `https://${DOMAIN}.auth.${REGION}.amazoncognito.com/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(logoutUri)}`
      },
      loading: auth.isLoading,
    }
  }, [auth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authority = `https://${DOMAIN}.auth.${REGION}.amazoncognito.com`
  const issuer = `https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}`

  return (
    <OidcProvider
      authority={authority}
      client_id={CLIENT_ID}
      redirect_uri={`${window.location.origin}/callback`}
      response_type="code"
      scope="openid email profile"
      userStore={new WebStorageStateStore({ store: window.localStorage })}
      metadata={{
        issuer,
        authorization_endpoint: `${authority}/oauth2/authorize`,
        token_endpoint: `${authority}/oauth2/token`,
        userinfo_endpoint: `${authority}/oauth2/userInfo`,
        end_session_endpoint: `${authority}/logout`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
      }}
      onSigninCallback={() => {
        window.history.replaceState({}, document.title, '/callback')
      }}
    >
      <AuthSync>{children}</AuthSync>
    </OidcProvider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
