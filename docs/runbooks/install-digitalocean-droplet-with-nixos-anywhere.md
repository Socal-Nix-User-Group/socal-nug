# Install a DigitalOcean droplet with nixos-anywhere

Procedure for installing one of this repo's hosts onto a DigitalOcean droplet over SSH, with the
droplet still running the stock Ubuntu image it was created from. First executed for
`nixos-anywhere-test1` on 2026-11-16; see
`docs/superpowers/specs/2026-11-16-nixos-anywhere-test-droplet-design.md` for why each value in
the host configuration is what it is.

Unlike the laptop case, the target is not booted from a NixOS installer. Its `/etc/os-release`
has no `VARIANT_ID`, so nixos-anywhere kexecs into a RAM-based installer first. Two consequences
run through everything below: the droplet needs at least 1.5 GB of RAM, and the installer that
does the partitioning is a different NixOS release from the one being installed.

## What makes DigitalOcean different

- **BIOS, not EFI.** Droplets boot with SeaBIOS and `/sys/firmware/efi` does not exist. The host
  uses GRUB on a GPT disk with a 1 MB EF02 BIOS-boot partition. There is no supported way to
  switch a standard droplet to EFI.
- **No DHCP.** Verified with `dhcpcd -T eth0`: it solicits for about twenty seconds, receives no
  offer, and falls back to an IPv4LL address. cloud-init writes a fully static netplan. A host
  left on the NixOS default of `networking.useDHCP = true` installs cleanly and then comes up
  unreachable. Copy the addresses out of the droplet's netplan into the host configuration.
- **No `/dev/disk/by-id`.** DigitalOcean's virtio disks carry no serial. `by-path` is the only
  stable handle: `/dev/disk/by-path/virtio-pci-0000:00:06.0`.
- **`/dev/vdb` is not a disk.** It is a 490 K iso9660 `config-2` volume holding cloud-init data.
  Never name it in a disko configuration.
- **Interface naming.** The droplet's own image boots with `net.ifnames=0`, giving `eth0`. NixOS
  would otherwise name the NIC `enp0s3`. The host sets `net.ifnames=0` so the static addresses
  and the interface name agree.

## Prerequisites

On the droplet:

1. Created from an Ubuntu image, with your SSH key added at creation so `root@<ip>` works.
1. At least 1.5 GB of RAM, excluding swap. The kexec installer runs from RAM. A 1 GB droplet is
   below the line.

Locally, in the repo root on the branch that adds the host:

1. The host is committed, or at least `git add -N`'d. Flakes ignore untracked files, so an
   untracked host file installs the wrong thing or fails to evaluate.
1. `nix flake check` is green. It evaluates `nixosConfigurations` but does not build them, so it
   catches evaluation errors cheaply.
1. `nix build --no-link .#nixosConfigurations.<host>.config.system.build.toplevel` succeeds.

## Pre-flight

Confirm the droplet still matches the addresses baked into the host. A destroyed and recreated
droplet gets a new IP, and installing a stale configuration onto it strands the machine.

```fish
ssh root@<ip> 'ip -4 -brief addr show eth0; ip route | grep default; free -m | head -2'
```

The addresses, the gateway and the RAM must match the host's `networking` block. Stop if any
differ, and fix the configuration before going further.

## Install

```fish
nix run .#nixos-anywhere -- \
  --no-disko-deps \
  --flake .#<host> \
  --target-host root@<ip>
```

`--no-disko-deps` is required here, and not for the reason the upstream documentation gives.

Upstream documents the flag as a memory optimisation for machines around 1 GB. The reason it is
needed on a 2 GB droplet is a version mismatch. Without it, nixos-anywhere uploads disko's own
dependency closure and the partitioning script runs `udevadm` from the nixpkgs this flake is
pinned to (systemd 262), while the kexec installer image is a different NixOS release running
`systemd-udevd` 257. A 262 `udevadm settle` against a 257 udevd returns before udev has recreated
the partition symlinks, and disko then fails:

```
mkfs.ext4 /dev/disk/by-partlabel/disk-main-root
The file /dev/disk/by-partlabel/disk-main-root does not exist and no size was specified.
```

This is deterministic, not flaky. It failed twice in a row, and the symlink is present a moment
later, which is what makes the error misleading. `--no-disko-deps` uploads only the partitioning
script, so disko uses the installer's own tools and `udevadm` matches the running udevd. Confirm
the installer provides what disko needs before relying on this: `sgdisk`, `partprobe`,
`mkfs.ext4`, `udevadm`, `blkid` and `jq` are all on a stock NixOS installer's `PATH`.

Expect, in order: `Uploading install SSH keys`, `Gathering machine facts`, the kexec and a brief
unreachable window, `Formatting hard drive with disko`, `Uploading the system closure`,
`Installing NixOS`, `installation finished!`, `Rebooting`. In the disko output, confirm it
partitions `virtio-pci-0000:00:06.0` and never `vdb`.

If the install fails after disko has already run, the droplet has no bootable system and exists
only as the RAM installer. Do not reboot it. A re-run skips the kexec, because the installer
reports `VARIANT_ID=installer`.

## After the install

Drop the old host key. The installed system generates its own, since `--copy-host-keys` was not
passed, so the entry recorded before the install will mismatch:

```fish
ssh-keygen -R <ip>
```

Then accept the new key normally. Do not reach for `StrictHostKeyChecking=no` to get past the
warning; the warning is correct and the key really did change.

## Post-install checks

Each line is a command and what it must show. Run them over SSH with host-key verification on;
connecting at all is itself the check that the key was recorded correctly.

- `nixos-version` prints the release the flake is pinned to, for example
  `26.11.20261030.1c89083 (Zokor)`.
- `hostname` equals the host's `networking.hostName`.
- `findmnt -no SOURCE,FSTYPE /` prints `/dev/vda2 ext4`.
- `lsblk -o NAME,SIZE,PARTTYPENAME /dev/vda` lists `vda1` at 1 M typed `BIOS boot` and `vda2`
  taking the rest.
- `ip -4 -brief addr show eth0` lists both addresses on **eth0**. A name like `enp0s3` means
  `net.ifnames=0` did not take and the host would not have come back on its own.
- `ip route | grep default` prints `default via <gateway> dev eth0 proto static`.
- `cat /proc/cmdline` contains `net.ifnames=0`, `console=ttyS0,115200`, and a `BOOT_IMAGE=(hd0,gptN)`
  prefix confirming GRUB booted from the GPT disk.
- `systemctl --failed` prints `0 loaded units listed`.

## Reboot check

The install leaves the machine running a system it never cold-booted. Only a reboot proves GRUB
installed into the BIOS-boot partition and the static networking comes up unaided. Record the
boot id, reboot, wait, and confirm it changed:

```fish
ssh root@<ip> 'cat /proc/sys/kernel/random/boot_id'
ssh root@<ip> 'systemctl reboot'; or true
# wait for it to answer again
ssh root@<ip> 'cat /proc/sys/kernel/random/boot_id; uptime'
```

The boot id must differ and `uptime` must show a fresh boot. Re-run the post-install checks; every
line must still hold. Reconnecting under host-key verification also confirms the host keys
persisted.

## Recovery

There is no root password, by design, so the DigitalOcean web console can show boot output but
cannot log in. The serial console settings exist for reading failures, not for fixing them.

A droplet that does not come back is destroyed and recreated, then installed again. Do not hand
patch it into life: whatever was wrong is wrong in the configuration, and a hand-fixed droplet
hides that. Recreating assigns a new IP, so update the host's `networking` block and re-run the
pre-flight before installing again.
