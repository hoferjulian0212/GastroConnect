"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

// shouldScaleBackground defaults to false: the app has no
// [data-vaul-drawer-wrapper], so scaling has no visual effect but leaves vaul
// managing body styles. On iOS this could strand `pointer-events: none` on
// <body> after the drawer closed, making the whole app (incl. the bottom nav)
// unresponsive to taps.
//
// Safety net: every Drawer root reports open/close through a composed
// onOpenChange (works for controlled AND uncontrolled use). When the last
// drawer closes we wait out the close animation and — only if no drawer and
// no other modal (e.g. a Radix dialog) is open — restore body interactivity.
let openDrawerCount = 0

function releaseBodyPointerLock() {
  setTimeout(() => {
    if (openDrawerCount > 0) return
    // Another modal layer may legitimately own the body lock — leave it alone.
    if (document.querySelector('[role="dialog"][data-state="open"], [data-vaul-drawer][data-state="open"]')) return
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = ""
    }
  }, 600)
}

const Drawer = ({
  shouldScaleBackground = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => {
  const isOpenRef = React.useRef(false)

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen !== isOpenRef.current) {
        isOpenRef.current = nextOpen
        openDrawerCount += nextOpen ? 1 : -1
        if (openDrawerCount < 0) openDrawerCount = 0
        if (!nextOpen) releaseBodyPointerLock()
      }
      onOpenChange?.(nextOpen)
    },
    [onOpenChange],
  )

  // If a drawer unmounts while still open, release its slot.
  React.useEffect(() => {
    return () => {
      if (isOpenRef.current) {
        isOpenRef.current = false
        openDrawerCount = Math.max(0, openDrawerCount - 1)
        releaseBodyPointerLock()
      }
    }
  }, [])

  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
        className
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-2 px-4 pt-5 pb-3 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 px-4 pt-3 pb-5", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
