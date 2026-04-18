import Image from "next/image";

export function GoogleDriveLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brands/google-drive.svg"
      alt="Google Drive"
      width={size}
      height={size}
      className={className}
    />
  );
}
