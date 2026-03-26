// permissions.js
(function () {
    const userDataRaw = localStorage.getItem('virtuosa_user');
    const isLoginPage = window.location.pathname.includes('login.html');

    // 1. Not logged in -> Redirect to login
    if (!userDataRaw && !isLoginPage) {
        window.location.href = 'login.html';
        return;
    }

    if (userDataRaw) {
        try {
            const user = JSON.parse(userDataRaw);
            const role = user.role || 'VENDEDOR';

            // 2. Already logged in -> Redirect away from login
            if (isLoginPage) {
                window.location.href = '/dashboard';
                return;
            }

            // 3. Apply profile data and permissions when DOM is ready
            document.addEventListener('DOMContentLoaded', () => {
                // Populate profile info
                const nameEls = document.querySelectorAll('.profile-name, .user-name, .profile-hero-name');
                const roleEls = document.querySelectorAll('.profile-role, .profile-hero-role');
                const emailEls = document.querySelectorAll('.user-email');
                const avatarEls = document.querySelectorAll('.profile-avatar, .profile-hero-avatar');

                const formatRole = (r) => r.charAt(0) + r.slice(1).toLowerCase();
                const displayRole = user.unit ? `${formatRole(role)} - ${user.unit}` : formatRole(role);
                const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

                if (nameEls) nameEls.forEach(el => el.textContent = user.name);
                if (roleEls) roleEls.forEach(el => el.textContent = displayRole);
                if (emailEls) emailEls.forEach(el => el.textContent = user.email);
                if (avatarEls) avatarEls.forEach(el => el.textContent = initials);

                // Apply UI permissions based on role and JSON rules
                applyRolePermissions(role, user.permissions);
                
                // Initialize Profile Menu & Logout globally
                initGlobalProfileMenu();
            });
        } catch (e) {
            console.error('Error parsing user data', e);
            localStorage.removeItem('virtuosa_user');
            if (!isLoginPage) window.location.href = 'login.html';
        }
    }

    function applyRolePermissions(role, permissions) {
        // Elements to protect
        const financeiroLinks = document.querySelectorAll('a[href*="3000"], a[href*="financeiro"], .financeiro-link');
        const dashboardLinks = document.querySelectorAll('a[href*="dashboard.html"]');
        const dashboardWidgets = document.querySelectorAll('#financeiro-widgets, .financeiro-widget');
        const adminUsersLinks = document.querySelectorAll('#admin-users-link');

        // RBAC Check: Admin visibility
        if (permissions && permissions.admin === true) {
            adminUsersLinks.forEach(link => link.style.display = 'flex');
        }

        if (role === 'VENDEDOR' || role === 'ESTETICISTA') {
            // Hide Financeiro menus
            financeiroLinks.forEach(link => link.style.display = 'none');

            // Hide Dashboard menus
            dashboardLinks.forEach(link => link.style.display = 'none');

            // Hide Dashboard widgets specific to Finance
            dashboardWidgets.forEach(widget => widget.style.display = 'none');

            // Re-route if they managed to enter Dashboard directly
            if (window.location.pathname.includes('dashboard.html')) {
                window.location.href = '/cancelamentos'; // Default safe page: Cancelamentos
            }
        }
        else if (role === 'GERENTE') {
            // Can see Dashboard and Financeiro but NOT Gestão de Usuários (done in Next.js)
        }
        else if (role === 'ADMINISTRADOR') {
            // Can see everything
        }
    }
    
    function initGlobalProfileMenu() {
        const profileTrigger = document.getElementById('profile-trigger');
        const userProfileWrapper = document.getElementById('user-profile');
        const logoutBtns = document.querySelectorAll('.logout, #logout-btn');

        // Global logout function accessible from console/browser agent
        window.performLogout = function() {
            localStorage.removeItem('virtuosa_user');
            window.location.href = '/login.html';
        };

        if (userProfileWrapper) {
            // Unbind any previous logic and use bulletproof delegation
            document.addEventListener('click', (e) => {
                const trigger = e.target.closest('#profile-trigger');
                const logoutTrigger = e.target.closest('.logout, #logout-btn');
                
                if (logoutTrigger) {
                    window.performLogout();
                    return;
                }

                if (trigger) {
                    e.preventDefault();
                    e.stopPropagation();
                    userProfileWrapper.classList.toggle('active');
                    return;
                }

                if (!userProfileWrapper.contains(e.target)) {
                    userProfileWrapper.classList.remove('active');
                }
            });

            // Handle dropdown specific navigation
            const dropdownItems = userProfileWrapper.querySelectorAll('.dropdown-item:not(.logout)');
            dropdownItems.forEach(item => {
                item.addEventListener('click', () => {
                    const text = item.textContent.trim();
                    if (text.includes('Meu Perfil')) {
                        window.location.href = 'profile.html';
                    } else if (text.includes('Alterar Senha')) {
                        if (window.location.pathname.includes('profile.html')) {
                            const pwModal = document.getElementById('password-modal');
                            if (pwModal) pwModal.style.display = 'flex';
                        } else {
                            window.location.href = 'profile.html#change-password';
                        }
                    }
                });
            });
        }

        // Handle unified Financeiro navigation
        const financeiroLinksCustom = document.querySelectorAll('.financeiro-link');
        financeiroLinksCustom.forEach(link => {
            link.addEventListener('click', (e) => {
                const sessionRaw = localStorage.getItem('virtuosa_user');
                if (!sessionRaw) {
                    e.preventDefault();
                    window.location.href = '/login.html';
                } else {
                    window.location.href = '/';
                }
            });
        });

    }
})();
