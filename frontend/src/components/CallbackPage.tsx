import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function CallbackPage() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) navigate(user ? '/' : '/login', { replace: true })
  }, [loading, user, navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing in...</p>
    </div>
  )
}
