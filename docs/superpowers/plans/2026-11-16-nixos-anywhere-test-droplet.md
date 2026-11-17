# NixOS test droplet via nixos-anywhere: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install NixOS onto the existing DigitalOcean droplet `178.128.76.203` with
`nixos-anywhere`, from a host configuration that lives in this repository.

**Architecture:** One new flake output directory, `nixosConfigurations/`, holding a single host
built from `inputs.nixpkgs.lib.nixosSystem` with disko's NixOS module. The host is deliberately
minimal: disko owns the partitioning, `profiles/qemu-guest.nix` owns the virtio hardware, and the
host file owns the three things the droplet dictates, namely BIOS GRUB, static networking, and the
root SSH key. Nothing is shared, abstracted, or parameterised.

**Tech Stack:** Nix flakes, nixpkgs unstable (`26.11pre-git`), disko, nixos-anywhere 1.13.0,
treefmt (nixfmt + mdformat).

**Spec:** `docs/superpowers/specs/2026-11-16-nixos-anywhere-test-droplet-design.md`

## Global Constraints

Values are copied verbatim from the spec. Every task's requirements include this section.

- Target: `root@178.128.76.203`. Hostname: `nixos-anywhere-test1`.
- Disk device, everywhere it appears: `/dev/disk/by-path/virtio-pci-0000:00:06.0`.
- Never reference `/dev/vdb`. It is the 490 K cloud-init config ISO.
- eth0 addresses: `178.128.76.203/20` and `10.46.0.5/16`. Gateway: `178.128.64.1`.
- Nameservers: `1.1.1.1` and `9.9.9.9`. Not DigitalOcean's `10.120.15.254`.
- `networking.useDHCP = false`. The droplet answers no DHCP offers.
- Kernel params: `net.ifnames=0`, `console=tty1`, `console=ttyS0,115200`.
- `nixpkgs.hostPlatform = "x86_64-linux"`. `system.stateVersion = "26.11"`.
- Root key, byte for byte:
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEbH7DL3UpeYHm+J3YHJTIsnk/vdo5JgEzwD/Bf1tupp yubikey`
- Out of scope: sops-nix, impermanence, IPv6, the eth1 VPC interface, a module namespace, any
  `checks` entry for this host, any password or password hash in the repository.
- Do not import `virtualisation/digital-ocean-config.nix`. It looks like the obviously right
  module and is not: it hardcodes `fileSystems."/"` with `autoResize`, which fights disko, and its
  `digitalocean-init` service rebuilds the system from DigitalOcean user data, which fights a
  flake-managed host. The spec's decisions section has the detail.
- `nix fmt` before every commit. nixfmt formats `.nix`; mdformat formats `docs/**/*.md`.
- Every commit gets an `Assisted-by: Claude Code (claude-opus-5)` trailer. Never a
  `Co-Authored-By` trailer. Commit messages: plain engineer voice, no em dashes.

## Review Focus

Failure modes the spec implies that the obvious tests would miss. Each has a test in the task that
owns the code.

1. The droplet's IP is hardcoded, and the spec's own recovery path is "destroy and recreate the
   droplet", which assigns a new one. A recreated droplet would install cleanly and never come
   back. Task 3 Step 1 compares the configured address against the live droplet before installing.
1. The root key is the only way in, since there is no password. A single transposed character
   bricks the host. Task 2 compares the configured key against the droplet's live
   `authorized_keys` rather than eyeballing it.
1. GRUB must target the same device disko partitioned, and the BIOS-boot partition must really be
   type EF02. A mismatch is invisible until the reboot. Task 1 asserts both against the generated
   disko script.
1. `disko` must follow `nixpkgs`, or a second nixpkgs evaluates and disko's module can drift from
   the system it partitions. Task 1 asserts it from `flake.lock`.
1. disko creates the 100%-sized root partition; the 1 MB BIOS partition must be ordered before it
   or there is no room left. Task 1 asserts the order in the generated script.

______________________________________________________________________

### Task 1: Flake wiring and a host that builds

**Files:**

- Modify: `flake.nix` (add the `disko` input and the `nixosConfigurations` output)
- Modify: `flake.lock` (regenerated)
- Create: `nixosConfigurations/default.nix`
- Create: `nixosConfigurations/nixos-anywhere-test1/default.nix`
- Create: `nixosConfigurations/nixos-anywhere-test1/disko.nix`

**Interfaces:**

- Consumes: nothing.

- Produces: the flake output `nixosConfigurations.nixos-anywhere-test1`, whose
  `config.system.build.toplevel` and `config.system.build.diskoScript` Task 2 and Task 3 use.
  `nixosConfigurations/nixos-anywhere-test1/default.nix` is the file Task 2 extends.

- [ ] **Step 1: Branch**

```bash
git switch -c nixos-anywhere-test-droplet
```

- [ ] **Step 2: Add the `disko` input to `flake.nix`**

Two lines in `inputs`, matching the existing `treefmt-nix` style and alphabetical placement:
`disko.url = "github:nix-community/disko";` and `disko.inputs.nixpkgs.follows = "nixpkgs";`.
Add `nixosConfigurations = import ./nixosConfigurations inputs;` to `outputs`, alphabetically
between `legacyPackages` and `overlays`.

- [ ] **Step 3: Verify the input follows nixpkgs (Review Focus 4)**

```bash
nix eval --impure --expr '(builtins.fromJSON (builtins.readFile ./flake.lock)).nodes.disko.inputs.nixpkgs'
```

Expected: `[ "nixpkgs" ]`, the same shape the existing `treefmt-nix` input produces. A bare
revision string, or a node named `nixpkgs_2`, means the `follows` line is missing and a second
nixpkgs is being evaluated.

- [ ] **Step 4: Write `nixosConfigurations/default.nix`**

An `inputs:` function returning one attribute, `nixos-anywhere-test1`, from
`inputs.nixpkgs.lib.nixosSystem` with `modules = [ inputs.disko.nixosModules.disko ./nixos-anywhere-test1 ];`.
No `system` argument; the host sets `nixpkgs.hostPlatform`. Follow the sibling output directories'
`inputs:`-taking style.

- [ ] **Step 5: Write `nixosConfigurations/nixos-anywhere-test1/disko.nix`**

A plain attrset module. The structure below is what the implementer cannot derive; the device
string comes from Global Constraints.

```nix
{
  disko.devices.disk.main = {
    type = "disk";
    device = "/dev/disk/by-path/virtio-pci-0000:00:06.0";
    content = {
      type = "gpt";
      partitions = {
        boot = {
          size = "1M";
          type = "EF02";
          priority = 1;
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
```

Comment why by-path and not by-id, and why EF02, citing the spec's constraints table.

- [ ] **Step 6: Write the boot and hardware half of `nixosConfigurations/nixos-anywhere-test1/default.nix`**

A module taking `{ modulesPath, ... }`. It imports `(modulesPath + "/profiles/qemu-guest.nix")`
and `./disko.nix`, and sets, with the values from Global Constraints:
`nixpkgs.hostPlatform`, `system.stateVersion`, `networking.hostName`,
`boot.loader.grub.enable`, `boot.loader.grub.efiSupport = false` (explicit, because BIOS-only is
the single most load-bearing fact about this host), `boot.loader.grub.devices`, and
`boot.kernelParams`. Networking, SSH and the root key are Task 2.

- [ ] **Step 7: Build the host**

Run: `nix build --no-link .#nixosConfigurations.nixos-anywhere-test1.config.system.build.toplevel`
Expected: builds. An error naming `fileSystems` means disko's module is not in the module list.

- [ ] **Step 8: Assert GRUB and disko agree on the device (Review Focus 3)**

Run both and compare by eye; they must be the same string:

```bash
nix eval --json .#nixosConfigurations.nixos-anywhere-test1.config.boot.loader.grub.devices
nix eval --raw .#nixosConfigurations.nixos-anywhere-test1.config.disko.devices.disk.main.device
```

Expected: `["/dev/disk/by-path/virtio-pci-0000:00:06.0"]` and the same path.

- [ ] **Step 9: Assert the generated disko script (Review Focus 3 and 5)**

```bash
nix build --no-link --print-out-paths \
  .#nixosConfigurations.nixos-anywhere-test1.config.system.build.diskoScript
```

Then against that store path: it must contain `virtio-pci-0000:00:06.0`, must contain `EF02`, must
not contain `vdb`, and the line creating the 1 M partition must appear before the line creating
the 100% partition. Expected: all four hold.

- [ ] **Step 10: Format, then check the whole flake**

Run: `nix fmt` then `nix flake check`
Expected: both clean. `nix flake check` now evaluates this host, which is intended.

- [ ] **Step 11: Commit**

```bash
git add flake.nix flake.lock nixosConfigurations
git commit -m "Add a NixOS host for a DigitalOcean test droplet

DigitalOcean boots droplets with SeaBIOS, so the host uses GRUB on a GPT
disk with an EF02 BIOS-boot partition. The disk is addressed by-path
because DigitalOcean virtio disks expose no by-id link.

Assisted-by: Claude Code (claude-opus-5)"
```

______________________________________________________________________

### Task 2: Make the installed host reachable

**Files:**

- Modify: `nixosConfigurations/nixos-anywhere-test1/default.nix`

**Interfaces:**

- Consumes: the host module from Task 1.

- Produces: no new names. Task 3 installs the result.

- [ ] **Step 1: Add networking, SSH and the root key**

To the same module, with the values from Global Constraints: `networking.useDHCP = false`,
`networking.interfaces.eth0.ipv4.addresses` (both addresses), `networking.defaultGateway`,
`networking.nameservers`, `services.openssh.enable`,
`services.openssh.settings.PermitRootLogin = "prohibit-password"`,
`services.openssh.settings.PasswordAuthentication = false`, and
`users.users.root.openssh.authorizedKeys.keys`. Do not set
`networking.firewall.allowedTCPPorts`; `services.openssh.openFirewall` defaults true and opens 22.
Comment that the static addressing is forced by the absent DHCP server, citing the spec.

- [ ] **Step 2: Assert the static addressing evaluated as intended**

```bash
nix eval --json .#nixosConfigurations.nixos-anywhere-test1.config.networking.interfaces.eth0.ipv4.addresses
nix eval .#nixosConfigurations.nixos-anywhere-test1.config.networking.useDHCP
nix eval --raw .#nixosConfigurations.nixos-anywhere-test1.config.networking.defaultGateway.address
```

Expected: the two address/prefix pairs from Global Constraints; `false`; `178.128.64.1`.

- [ ] **Step 3: Assert the key matches the one that works today (Review Focus 2)**

Compare the configured key against the droplet's live `authorized_keys`, ignoring the trailing
comment, which differs (`yubikey` here, `cardno:32_178_015` there):

```bash
nix eval --json .#nixosConfigurations.nixos-anywhere-test1.config.users.users.root.openssh.authorizedKeys.keys
ssh -o BatchMode=yes root@178.128.76.203 'cut -d" " -f1,2 /root/.ssh/authorized_keys'
```

Expected: the first two fields are identical. They must match exactly; there is no password
fallback.

- [ ] **Step 4: Assert the address reaches a real systemd unit**

This is the step that proves `net.ifnames=0` and the interface name agree. Build the toplevel, then
search the generated units for the address:

```bash
nix build .#nixosConfigurations.nixos-anywhere-test1.config.system.build.toplevel
grep -rl '178\.128\.76\.203' result/etc/systemd/system/
```

Expected: at least `network-addresses-eth0.service`. A hit on an `enp0s3` unit, or no hit at all,
means the interface name is wrong and the host would come up unreachable. Remove the `result`
symlink afterwards.

- [ ] **Step 5: Format and check**

Run: `nix fmt` then `nix flake check`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add nixosConfigurations
git commit -m "Give the test droplet static networking and the root key

The droplet answers no DHCP offers, verified with dhcpcd -T on eth0, so
every address is static and copied from its cloud-init netplan. net.ifnames=0
keeps the interface named eth0, matching those addresses.

Assisted-by: Claude Code (claude-opus-5)"
```

______________________________________________________________________

### Task 3: Install onto the droplet, verify it, and write the runbook

**Files:**

- Create: `docs/runbooks/install-digitalocean-droplet-with-nixos-anywhere.md`

**Interfaces:**

- Consumes: `nixosConfigurations.nixos-anywhere-test1` from Tasks 1 and 2.

- Produces: a running NixOS droplet and the runbook.

- [ ] **Step 1: Pre-flight, confirm the droplet still matches the config (Review Focus 1)**

```bash
ssh -o BatchMode=yes root@178.128.76.203 'ip -4 -brief addr show eth0; ip route | grep default; free -m | head -2'
```

Expected: `178.128.76.203/20` and `10.46.0.5/16`, default via `178.128.64.1`, about 1967 MB RAM.
**Stop if any differ.** A recreated droplet has a new IP, and installing this configuration onto
it would strand it.

- [ ] **Step 2: Make the new files visible to the flake**

Run: `git status --short` and confirm nothing under `nixosConfigurations/` is untracked. Flakes
ignore untracked files, so an untracked host file installs the wrong thing or fails to evaluate.
If anything is untracked, `git add -N` it.

- [ ] **Step 3: Install**

```bash
nix run .#nixos-anywhere -- \
  --flake .#nixos-anywhere-test1 \
  --target-host root@178.128.76.203
```

Expected: kexec into the installer (the droplet is Ubuntu, so `VARIANT_ID` is unset and kexec is
not skipped), then disko destroy/format/mount, then the closure copy, `nixos-install`, and a
reboot. In the disko output, confirm it partitions `virtio-pci-0000:00:06.0` and never `vdb`.
Do not pass `--no-disko-deps`; at 2 GB this droplet is above the 1.5 GB kexec minimum.

- [ ] **Step 4: Drop the old host key**

Run: `ssh-keygen -R 178.128.76.203`
The installed system generated fresh host keys, since `--copy-host-keys` was not passed, so the
old entry will mismatch. Removing it deliberately is the point; do not reach for
`StrictHostKeyChecking=no` to get past the warning.

- [ ] **Step 5: Verify the installed host**

Give it a minute to boot, then:

```bash
ssh root@178.128.76.203 'nixos-version; hostname; findmnt -no SOURCE,FSTYPE /; lsblk -o NAME,SIZE,PARTTYPENAME /dev/vda; ip -4 -brief addr show eth0; ip route | grep default; cat /proc/cmdline; systemctl --failed'
```

Expected, line by line: a `26.11` version string; `nixos-anywhere-test1`; an ext4 root; `vda1`
about 1 M typed BIOS boot and `vda2` taking the rest; `178.128.76.203/20` and `10.46.0.5/16` on
**eth0**, not `enp0s3`; default via `178.128.64.1`; a cmdline containing `net.ifnames=0` and
`console=ttyS0,115200`; and `0 loaded units listed` from `systemctl --failed`.

- [ ] **Step 6: Confirm it survives a reboot**

```bash
ssh root@178.128.76.203 'systemctl reboot' || true
```

Wait, then re-run Step 5's command. Expected: identical output. This is the real test. The install
left the machine running from a freshly built system; only a cold boot proves GRUB installed into
the BIOS-boot partition and the static networking comes up on its own.

- [ ] **Step 7: Write the runbook**

Create `docs/runbooks/install-digitalocean-droplet-with-nixos-anywhere.md` recording what was
actually done, not what was planned: prerequisites, the pre-flight check from Step 1 and why it
exists, the install command, the host-key removal, the Step 5 verification table, and a recovery
section saying that a droplet that does not come back is destroyed and recreated rather than
rescued. Note any way reality differed from the spec's constraints table. Follow the house style
of theonecfg's `docs/runbooks/install-laptop-with-nixos-anywhere.md`: each verification line is a
command and what it must show.

- [ ] **Step 8: Format and check**

Run: `nix fmt` then `nix flake check`
Expected: both clean. mdformat covers `docs/**/*.md`, so the new runbook is formatted.

- [ ] **Step 9: Commit**

```bash
git add docs/runbooks
git commit -m "Add a runbook for installing a DigitalOcean droplet

Records the install that was actually run against 178.128.76.203, including
the pre-flight address check that catches a recreated droplet before it is
installed onto with a stale static address.

Assisted-by: Claude Code (claude-opus-5)"
```
