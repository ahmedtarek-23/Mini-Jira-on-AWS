import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LayoutDashboard } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LayoutDashboard className="size-6" />
          </div>
          <CardTitle className="text-2xl">Mini Jira</CardTitle>
          <p className="text-sm text-muted-foreground">Team task management</p>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={login}>
            Sign in with Cognito
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
