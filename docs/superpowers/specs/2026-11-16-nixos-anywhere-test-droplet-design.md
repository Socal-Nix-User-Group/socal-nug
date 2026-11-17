# NixOS on a DigitalOcean test droplet via nixos-anywhere

Date: 2026-11-16. Short design (small change).

## Intent

Find out whether `nixos-anywhere` can install NixOS onto a DigitalOcean droplet, and leave the
configuration that did it in this repository. This is the first NixOS code in socal-nug. The
longer-term reason is self-hosting, which the CI and deploy design (2026-10-31) lists as a
non-goal to be picked up later; this host proves the install path and nothing else.

Droplet already created by the maintainer: SFO2, 1 vCPU, 2 GB RAM, 50 GB disk, Ubuntu 24.04.5 LTS,
`178.128.76.203`, hostname `nixos-anywhere-test1`.

## Goals

- `nix run .#nixos-anywhere -- --flake .#nixos-anywhere-test1 --target-host root@178.128.76.203`
  installs NixOS, the droplet reboots into it, and it is reachable over SSH as root with the same
  YubiKey key that reaches it today.
- The configuration lives in this repo under its existing one-directory-per-flake-output
  convention, so a second host later is a sibling directory and nothing else.
- The procedure is written down well enough to repeat deliberately, not rediscovered.

## Non-goals

- sops-nix and impermanence. Explicitly deferred by the maintainer.
- Serving the site: no Caddy, TLS, DNS, or `socal-nug-site` deployment.
- A `socal-nug.*` module namespace or a shared server profile. Nothing shares anything yet.
- IPv6. Not enabled on this droplet (link-local only on both interfaces).
- The VPC interface `eth1` (`10.120.0.2/20`). A test host has no use for it.
- Building the host in CI. Corrected 2026-11-16: `nix flake check` *does* evaluate
  `nixosConfigurations`, but does not build them. Verified both halves — a configuration with an
  undefined variable fails the check, and one containing a package that always fails to build
  still passes. So CI picks up an evaluation check for this host for free, at no build cost, and
  no `checks` entry is wanted.

## Anti-goals

Things that would make this a failure even if NixOS boots:

- A host that needs hand-fixing over the DO web console to become reachable. If the installed
  system does not come back on its own, the design was wrong, not the execution.
- Any secret in this public repository. A password hash counts.
- disko touching `/dev/vdb`. That is the 490 K cloud-init config ISO, not a spare disk.

## Constraints

Every line below was checked on the droplet on 2026-11-16, not inferred from documentation.

| Fact                                                                     | Evidence                                                                                                                 | Consequence                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Root SSH key auth works now                                              | `ssh -o BatchMode=yes root@…` succeeds                                                                                   | No `--env-password`; no password staging                                                                                     |
| Key is the same YubiKey key as theonecfg                                 | droplet key `AAAA…1tupp` comment `cardno:32_178_015`; theonecfg's identical, comment `yubikey`                           | Reuse that exact key string                                                                                                  |
| Ubuntu 24.04.5, `VARIANT_ID` unset                                       | `/etc/os-release`                                                                                                        | kexec path, not the installer path the laptop runbook documents                                                              |
| 1967 MB RAM                                                              | `free -m`                                                                                                                | Above the 1.5 GB kexec minimum. Corrected 2026-11-16: `--no-disko-deps` IS needed, for an unrelated reason. See the runbook. |
| BIOS boot, no `/sys/firmware/efi`                                        | directory absent                                                                                                         | GRUB on the disk, not systemd-boot; GPT needs a BIOS-boot partition                                                          |
| `kexec` not installed on target                                          | `command -v kexec` empty                                                                                                 | Fine: the kexec installer ships its own binary                                                                               |
| **No DHCP server**                                                       | `dhcpcd -T eth0` solicited ~20 s, no offer, fell back to IPv4LL `169.254.215.197`                                        | `networking.useDHCP = true` (the NixOS default) would come up with no network. Static config required                        |
| eth0 `178.128.76.203/20`, gw `178.128.64.1`, anchor `10.46.0.5/16`       | `ip addr`, `ip route`, `/etc/netplan/50-cloud-init.yaml`                                                                 | The static values to encode                                                                                                  |
| DO resolver `10.120.15.254` sits inside eth1's subnet                    | netplan; eth1 is `10.120.0.2/20`                                                                                         | Dropping eth1 means dropping that resolver too. Use public resolvers                                                         |
| Ubuntu boots `net.ifnames=0 biosdevname=0`; NIC altnames `enp0s3`/`ens3` | `/proc/cmdline`, `ip -o link`                                                                                            | NixOS would name it `enp0s3` by default. Interface name must be pinned deliberately                                          |
| No `/dev/disk/by-id/` entries                                            | directory empty                                                                                                          | by-id is unavailable; `by-path/virtio-pci-0000:00:06.0` is the only stable handle for vda                                    |
| `/dev/vdb` is a 490 K iso9660 `config-2`                                 | `blkid`                                                                                                                  | Must never be a disko target                                                                                                 |
| kexec installer preserves networking                                     | `kexec-run.sh` writes `addrs.json`, `routes-v4.json`, `routes-v6.json` into the initrd; `restore_routes.py` replays them | The install itself survives the missing DHCP                                                                                 |
| DO metadata hostname is already `nixos-anywhere-test1`                   | `curl 169.254.169.254/metadata/v1/hostname`                                                                              | Config hostname and droplet agree                                                                                            |
| `pkgs.nixos-anywhere` is 1.13.0 on unstable                              | NixHub                                                                                                                   | `nix run .#nixos-anywhere` resolves through this repo's `legacyPackages`                                                     |
| `lib.version` is `26.11pre-git`                                          | `nix eval` on the pinned input                                                                                           | `system.stateVersion = "26.11"`                                                                                              |

## Approaches

1. **Minimal test host — chosen.** One `nixosConfigurations/nixos-anywhere-test1/` directory with
   `default.nix` and `disko.nix`, a `disko` flake input, and one line in `flake.nix`. No module
   namespace, no profile, no shared anything. Roughly 70 lines.
1. **Test host plus the skeleton it grows into.** The same, plus `nixosModules/` with a
   `socal-nug.*` namespace and a shared server base, mirroring theonecfg. Rejected for now: there
   is one host and no second consumer, and the repo's own rule is no speculative abstractions. The
   namespace earns its place when something actually shares it.
1. **Scratchpad spike, nothing committed.** Rejected: no faster than committing 70 lines, and the
   maintainer has already said the configuration belongs in this repo.

## Decisions

Each is a call made here, with the alternative that was rejected.

- **Networking: static on eth0, no DHCP.** `178.128.76.203/20`, gateway `178.128.64.1`, plus the
  anchor address `10.46.0.5/16` to match cloud-init. Forced by the `dhcpcd -T` result above.
- **Interface name: `boot.kernelParams = [ "net.ifnames=0" ]` and `networking.interfaces.eth0`.**
  Mirrors what DigitalOcean's own image does, and `eth0` is deterministic for the first virtio NIC.
  Rejected: `enp0s3`, which would depend on udev's predictable naming resolving exactly as the
  observed altname.
- **DNS: `1.1.1.1` and `9.9.9.9`.** Rejected: DO's `10.120.15.254`, which is only reachable over
  the eth1 VPC interface this design drops.
- **Disk target: `/dev/disk/by-path/virtio-pci-0000:00:06.0`.** The only stable handle, since
  by-id is empty here, and it cannot accidentally resolve to the `vdb` config ISO. Rejected: bare
  `/dev/vda`, which every DO example uses but relies on kernel enumeration order.
- **Layout: GPT, 1 MB BIOS-boot partition (EF02), rest ext4 at `/`.** No swap, no separate `/boot`.
  Forced by BIOS boot. Rejected: msdos/MBR, which works but gives up GPT for no gain.
- **Bootloader: GRUB on that device, `efiSupport = false`.**
- **Serial console: `console=tty1 console=ttyS0,115200`.** Matches Ubuntu's own cmdline, so the DO
  web console can at least show boot output if the host does not come back. This is diagnosis, not
  recovery.
- **No root password.** Recovery for a failed boot is destroying and recreating the droplet, which
  costs a minute. Rejected: a hashed password in the config, which would put a credential in a
  public repo to save very little.
- **Hardware: `profiles/qemu-guest.nix`.** Covers the virtio modules. Rejected:
  `--generate-hardware-config`, unnecessary when disko declares the filesystems and qemu-guest
  declares the rest.
- **Not `virtualisation/digital-ocean-config.nix`.** It is built for DO's image flow: it hardcodes
  `fileSystems."/"` to a label with `autoResize`, which fights disko, and its `digitalocean-init`
  service rebuilds the system from DO user data, which fights a flake-managed host.
- **Root-only.** No `djacu` user; the key goes on root.
- **`services.openssh` with `PermitRootLogin = "prohibit-password"`.** `openFirewall` defaults true,
  so port 22 opens itself; the firewall otherwise stays at its default closed state.

## What's left to the builder

- Exact file layout inside `nixosConfigurations/`, following the sibling output directories.
- Whether `nixosConfigurations/default.nix` enumerates the one host explicitly or discovers
  directories the way theonecfg does. With one host, explicit is expected.
- Running `nix fmt` before committing. The `formatting` flake check will fail otherwise.
- `git add -N` on the new files before invoking nixos-anywhere; flakes ignore untracked files.
- `ssh-keygen -R 178.128.76.203` after the install. The installed system generates fresh host keys
  unless `--copy-host-keys` is passed, so the old entry will mismatch.

## Risks

- **The networking config is wrong in a way that only shows after reboot.** Most likely failure.
  Mitigated by taking the values from the running droplet rather than from documentation, and
  bounded by the droplet being disposable.
- **GRUB does not install to a BIOS-boot partition the way expected.** Visible during the install,
  not after, so it fails loudly.
- Everything here is verified against *this* droplet. A droplet in another region, or a resized
  one, needs the facts re-checked rather than this config copied.
