"use client"
import { cn } from "@/lib/utils"

type ActiveTab = "overview" | "logs" | "changelog" | "settings"

interface NavbarProps {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  projectName?: string
  projectInitial?: string
}

export default function Navbar({
  activeTab,
  onTabChange,
  projectName = "WA Bot Instance",
  projectInitial = "W",
}: NavbarProps) {
  return (
    <div className="flex flex-col">
      {/* Top Navigation */}
      <div className="flex items-center justify-between px-4 py-2 bg-black border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-3">
            <button className="text-white hover:text-gray-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3L22 18H2L12 3Z" fill="white" />
              </svg>
            </button>
            <span className="text-gray-400">/</span>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                <span className="text-white text-xs">{projectInitial}</span>
              </div>
              <span className="text-white font-medium">{projectName}</span>
              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">Hobby</span>
              <button className="text-gray-400 hover:text-white">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 10L4 6H12L8 10Z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="text-gray-400 hover:text-white text-sm" onClick={() => onTabChange("changelog")}>
            Changelog
          </button>
          <button className="relative text-gray-400 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10 2C10.5523 2 11 2.44772 11 3V3.01C11 3.56228 10.5523 4.01 10 4.01C9.44772 4.01 9 3.56228 9 3.01V3C9 2.44772 9.44772 2 10 2ZM15.5 5C15.7761 5 16 5.22386 16 5.5C16 5.77614 15.7761 6 15.5 6H15.49C15.2139 6 14.99 5.77614 14.99 5.5C14.99 5.22386 15.2139 5 15.49 5H15.5ZM10 18C9.44772 18 9 17.5523 9 17V16.99C9 16.4377 9.44772 15.99 10 15.99C10.5523 15.99 11 16.4377 11 16.99V17C11 17.5523 10.5523 18 10 18ZM4.5 5C4.77614 5 5 5.22386 5 5.5C5 5.77614 4.77614 6 4.5 6H4.49C4.21386 6 3.99 5.77614 3.99 5.5C3.99 5.22386 4.21386 5 4.49 5H4.5ZM4.5 14C4.77614 14 5 14.2239 5 14.5C5 14.7761 4.77614 15 4.5 15H4.49C4.21386 15 3.99 14.7761 3.99 14.5C3.99 14.2239 4.21386 14 4.49 14H4.5ZM15.5 14C15.7761 14 16 14.2239 16 14.5C16 14.7761 15.7761 15 15.5 15H15.49C15.2139 15 14.99 14.7761 14.99 14.5C14.99 14.2239 15.2139 14 15.49 14H15.5ZM18 10C18 10.5523 17.5523 11 17 11H16.99C16.4377 11 15.99 10.5523 15.99 10C15.99 9.44772 16.4377 9 16.99 9H17C17.5523 9 18 9.44772 18 10ZM4 10C4 10.5523 3.55228 11 3 11H2.99C2.43772 11 1.99 10.5523 1.99 10C1.99 9.44772 2.43772 9 2.99 9H3C3.55228 9 4 9.44772 4 10ZM16.9497 16.9497C16.6568 17.2426 16.1819 17.2426 15.889 16.9497L15.8823 16.943C15.5894 16.6501 15.5894 16.1753 15.8823 15.8823C16.1752 15.5894 16.6501 15.5894 16.943 15.8823L16.9497 15.889C17.2426 16.1819 17.2426 16.6568 16.9497 16.9497ZM4.11667 4.11667C4.40956 4.40956 4.40956 4.88444 4.11667 5.17733L4.11 5.184C3.81711 5.47689 3.34222 5.47689 3.04933 5.184C2.75644 4.89111 2.75644 4.41622 3.04933 4.12333L3.056 4.11667C3.34889 3.82378 3.82378 3.82378 4.11667 4.11667ZM16.9497 3.05025C17.2426 3.34315 17.2426 3.81802 16.9497 4.11091L16.943 4.11758C16.6501 4.41047 16.1752 4.41047 15.8823 4.11758C15.5894 3.82469 15.5894 3.34981 15.8823 3.05692L15.889 3.05025C16.1819 2.75736 16.6568 2.75736 16.9497 3.05025ZM4.11667 15.8833C4.40956 16.1762 4.40956 16.6511 4.11667 16.944L4.11 16.9507C3.81711 17.2436 3.34222 17.2436 3.04933 16.9507C2.75644 16.6578 2.75644 16.1829 3.04933 15.89L3.056 15.8833C3.34889 15.5904 3.82378 15.5904 4.11667 15.8833Z"
                fill="currentColor"
              />
            </svg>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-xs flex items-center justify-center text-white">
              1
            </span>
          </button>
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white text-xs">{projectInitial}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-6 px-4 py-2 bg-black border-b border-gray-800 text-sm">
        <button
          className={cn(
            "pb-2",
            activeTab === "overview" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white",
          )}
          onClick={() => onTabChange("overview")}
        >
          Overview
        </button>
        <button
          className={cn(
            "pb-2",
            activeTab === "logs" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white",
          )}
          onClick={() => onTabChange("logs")}
        >
          Logs
        </button>
        <button
          className={cn(
            "pb-2",
            activeTab === "changelog" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white",
          )}
          onClick={() => onTabChange("changelog")}
        >
          Changelog
        </button>
        <button
          className={cn(
            "pb-2",
            activeTab === "settings" ? "text-white border-b-2 border-white" : "text-gray-400 hover:text-white",
          )}
          onClick={() => onTabChange("settings")}
        >
          Settings
        </button>
      </div>
    </div>
  )
}
