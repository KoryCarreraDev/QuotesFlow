-- CreateEnum
CREATE TYPE "DeletedState" AS ENUM ('DELETED', 'INUSE');

-- AlterTable
ALTER TABLE "CompanyContact" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Formula" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "LeadStatusConfig" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "LeadStatusHistory" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deleted" "DeletedState" NOT NULL DEFAULT 'INUSE';
