-- F2-T03: bloqueo progresivo de login por intentos fallidos seguidos.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loginLockedUntil" TIMESTAMP(3);

