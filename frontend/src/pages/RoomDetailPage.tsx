import { useParams, Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

export default function RoomDetailPage() {
  const { name } = useParams<{ name: string }>()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/rooms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Rooms
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Room: {name}</h1>
      <p className="text-muted-foreground">Room detail page — coming soon.</p>
    </div>
  )
}
